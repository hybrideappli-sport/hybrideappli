import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { sendTransactionalEmail } from "./send-email";
import { sendWebPushToUser } from "./send-push";

/**
 * `notifyUser()` — un seul point d'entrée pour le triple canal d'ADR-011 §5/R8 : une ligne
 * `notifications` (`channel = 'in_app'`, alimente le badge Dashboard — repli le plus fiable,
 * `read_at`) puis émission best-effort sur Web Push et e-mail Brevo. Aucun échec de canal externe
 * ne remonte : la ligne `in_app` est la seule garantie dure (ADR-011 §4, « la révision hebdomadaire
 * est un rituel produit : la manquer coûte plus cher qu'un texte moins élégant »).
 */
export async function notifyUser(
  admin: SupabaseClient<Database>,
  args: { userId: string; type: string; title: string; body: string; deepLink?: string | null },
): Promise<{ notificationId: string }> {
  const { userId, type, title, body, deepLink = null } = args;

  const { data: inserted, error } = await admin
    .from("notifications")
    .insert({ user_id: userId, type, channel: "in_app", title, body, deep_link: deepLink, status: "sent", sent_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`notifyUser: notifications — ${error.message}`);

  // Best-effort — jamais bloquant pour l'appelant (job de révision, cron fin d'objectif…).
  await sendWebPushToUser(admin, userId, { title, body, deepLink }).catch((err) =>
    console.warn(`[notify] Web Push échoué pour user=${userId} : ${err instanceof Error ? err.message : String(err)}`),
  );

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authUser.user?.email) {
    console.warn(`[notify] e-mail introuvable pour user=${userId} — canal Brevo ignoré.`);
  } else {
    await sendTransactionalEmail({
      to: authUser.user.email,
      subject: title,
      htmlContent: `<p>${body}</p>${deepLink ? `<p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${deepLink}">Voir sur Hybride Club</a></p>` : ""}`,
    }).catch((err) => console.warn(`[notify] Brevo échoué pour user=${userId} : ${err instanceof Error ? err.message : String(err)}`));
  }

  return { notificationId: inserted.id };
}
