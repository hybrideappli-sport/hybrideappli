import "server-only";

import webPush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * Web Push (VAPID) — ADR-011 §5, R8 (`08-architecture.md` §12) : un des trois canaux de la
 * notification « ta semaine est prête », avec Brevo (e-mail) et le badge Dashboard (repli le plus
 * fiable, limites connues du Web Push sur iOS hors PWA installée).
 *
 * `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` absentes ⟹ dégradation EXPLICITE
 * (avertissement, aucun envoi), jamais un crash : même principe que `getLlmProvider()`
 * (`coach-llm-provider.ts`) pour `MISTRAL_API_KEY` absente. Un job de révision hebdomadaire ne doit
 * jamais échouer pour un canal de notification en panne (ADR-011 §4).
 */
function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT absentes — envoi Web Push désactivé (dégradé).");
    return false;
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  deepLink: string | null;
}

/**
 * Envoie à TOUS les `push_subscriptions` de l'utilisateur. Un endpoint expiré/révoqué (410/404)
 * est nettoyé silencieusement ; toute autre erreur est journalisée sans jamais remonter — un canal
 * de notification en échec ne doit jamais faire échouer le job appelant (ADR-011 §4).
 */
export async function sendWebPushToUser(admin: SupabaseClient<Database>, userId: string, payload: PushPayload): Promise<{ sent: number }> {
  if (!configureWebPush()) return { sent: 0 };

  const { data: subscriptions, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) {
    console.warn(`[push] lecture push_subscriptions échouée pour user=${userId} : ${error.message}`);
    return { sent: 0 };
  }
  if (!subscriptions || subscriptions.length === 0) return { sent: 0 };

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, deepLink: payload.deepLink }),
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Endpoint expiré/révoqué côté navigateur — nettoyage, pas une erreur applicative.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.warn(`[push] envoi échoué (endpoint=${sub.id}) : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );
  return { sent };
}
