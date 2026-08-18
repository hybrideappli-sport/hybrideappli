import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { fetchDataSources } from "@/lib/data/fetch-data-sources";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/data/providers` — AC1. Une entrée par `data_providers` (référentiel — ajouter une
 * source future est une ligne, pas un déploiement), avec l'état de connexion de l'utilisateur.
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  try {
    const body = await fetchDataSources(admin, user.id);
    return apiJson(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[data/providers] échec pour user=${user.id} : ${message}`);
    return apiError(500, "INTERNAL_ERROR", "Les sources de données n'ont pas pu être chargées.");
  }
}
