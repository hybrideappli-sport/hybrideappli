import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { evaluateReadiness, summarize } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `GET /api/v1/health/readiness` — ce qui manque à cet environnement pour servir le produit
 * (`docs/pret-pour-la-prod.md` §8) : variables d'environnement et état de la base que `seed.sql`
 * masque en local. `200` si prêt, `503` sinon, avec la liste des problèmes.
 *
 * Protégée comme les crons (`Authorization: Bearer ${CRON_SECRET}`) : la réponse décrit la
 * configuration, jamais une valeur, mais elle n'a pas à être publique.
 *
 * Exception assumée : si `CRON_SECRET` elle-même manque, aucune requête ne peut s'authentifier, et
 * la route ne pourrait jamais dire pourquoi. Elle répond alors ce SEUL constat, sans rien lire
 * d'autre — il ne révèle rien qu'un cron refusé ne révèle déjà.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    const report = summarize(
      [
        {
          id: "CRON_SECRET",
          category: "env",
          status: "missing",
          severity: "fail_closed",
          feature: "Les six crons de vercel.json, et cette route",
          paused: false,
          detail: "à définir en premier : le reste du diagnostic en dépend",
        },
      ],
      new Date().toISOString(),
    );
    return apiJson(report, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête non autorisée.");

  const report = await evaluateReadiness(createSupabaseServiceRoleClient(), process.env);
  return apiJson(report, { status: report.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
