import "server-only";

/**
 * Protection des routes `/api/v1/cron/*` (`08-architecture.md` §6.8) : en-tête
 * `Authorization: Bearer ${CRON_SECRET}`, jamais exposées à l'utilisateur final. Vercel Cron
 * envoie cet en-tête automatiquement pour les invocations programmées (`vercel.json`) ; les appels
 * manuels (tests, rejeu d'un cron manqué) doivent le fournir explicitement.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET absente — toute requête cron est refusée (fail closed).");
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
