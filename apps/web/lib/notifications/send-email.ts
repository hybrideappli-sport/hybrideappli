import "server-only";

/**
 * E-mail transactionnel via Brevo (API REST directe — pas de SDK, un seul appel `fetch`, même
 * esprit que le reste du monorepo qui n'ajoute pas de dépendance pour un usage unique). Repli
 * (ADR-001, ADR-011 §5) : le canal le plus fiable après le badge Dashboard, notamment pour les
 * utilisateurs Web Push iOS hors PWA installée.
 *
 * `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` absentes ⟹ dégradation EXPLICITE, aucun envoi, jamais un
 * crash — même principe que `send-push.ts`/`getLlmProvider()`.
 */
export interface EmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
}

export async function sendTransactionalEmail(payload: EmailPayload): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    console.warn("[email] BREVO_API_KEY/BREVO_SENDER_EMAIL absentes — envoi e-mail désactivé (dégradé).");
    return { sent: false };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: "Hybride Club" },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.htmlContent,
      }),
    });
    if (!response.ok) {
      console.warn(`[email] Brevo a répondu ${response.status} — envoi échoué (dégradé, non bloquant).`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.warn(`[email] envoi échoué : ${err instanceof Error ? err.message : String(err)}`);
    return { sent: false };
  }
}
