import { PushSubscriptionInputSchema, type PushSubscriptionResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/push/subscriptions` — ADR-011 §5, R8. Enregistre l'abonnement Web Push (VAPID) du
 * navigateur courant. Écrit avec le client RLS de l'utilisateur (`supabase`, pas `service_role`) :
 * `push_subscriptions_own` (`docs/db-schema.md` §8) couvre déjà toute la sécurité nécessaire.
 *
 * Point ouvert (voir rapport de fin de lot) : la capacité serveur (envoi Web Push,
 * `apps/web/lib/notifications/send-push.ts`) est complète et fonctionnelle dès qu'une ligne existe
 * ici, mais AUCUNE UI cliente (bouton « activer les notifications », `navigator.serviceWorker`,
 * `sw.js`, appel à cette route) n'est câblée à ce lot — hors budget. Le canal e-mail (Brevo) et le
 * badge Dashboard restent pleinement fonctionnels sans cette étape.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = PushSubscriptionInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Abonnement Web Push invalide.", parsed.error.issues);

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
      { onConflict: "endpoint" },
    )
    .select("id")
    .single();
  if (error) return apiError(500, "INTERNAL_ERROR", error.message);

  const body: PushSubscriptionResponse = { id: data.id };
  return apiJson<PushSubscriptionResponse>(body);
}

/** `DELETE /api/v1/push/subscriptions?endpoint=...` — désabonnement (rotation d'endpoint, retrait explicite). */
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return apiError(400, "VALIDATION_FAILED", "Paramètre `endpoint` requis.");

  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (error) return apiError(500, "INTERNAL_ERROR", error.message);

  return apiJson({ deleted: true });
}
