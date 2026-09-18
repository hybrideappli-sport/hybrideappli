import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { AuthorizeConnectionResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import { buildAuthorizeUrl, createSignedState } from "@/lib/providers/strava/oauth";

export const dynamic = "force-dynamic";

const LOCALE = "fr";

/**
 * `POST /api/v1/data/connections/:provider/authorize` — AC2, `08-architecture.md` §13.3. Écran
 * bloquant AVANT ce point d'entrée (`/donnees/consentement`) : cette route est la garde SERVEUR de
 * ce même verrou (défense en profondeur), pas la seule.
 */
export async function POST(request: Request, { params }: { params: Promise<{ connection: string }> }) {
  // Segment dynamique nommé `[connection]` (contrainte Next.js : un seul nom de slug par niveau —
  // la route soeur `../route.ts` y lit un UUID de connexion). Ici il porte un identifiant de
  // fournisseur : renommé localement pour que la suite du fichier reste explicite.
  const { connection: provider } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  const { data: providerRow, error: providerError } = await admin
    .from("data_providers")
    .select("code, kind, is_available")
    .eq("code", provider)
    .maybeSingle();
  if (providerError) return apiError(500, "INTERNAL_ERROR", providerError.message);
  if (!providerRow || providerRow.kind !== "oauth" || !providerRow.is_available) {
    return apiError(400, "VALIDATION_FAILED", "Source de données inconnue ou non connectable par OAuth.");
  }
  if (provider !== "strava") {
    // Seule source OAuth réellement câblée en V1 (ADR-013) : le référentiel `data_providers` peut
    // lister une source future sans code applicatif prêt — refus explicite plutôt qu'un crash.
    return apiError(400, "VALIDATION_FAILED", `Source '${provider}' pas encore prise en charge.`);
  }

  // 503 (document absent de l'environnement, ADR-010 §9) vs 403 (CET utilisateur ne l'a pas encore
  // accordé) — deux causes distinctes du même contrat §13.3.
  const { data: currentDocument, error: documentError } = await admin
    .from("consent_documents")
    .select("version")
    .eq("code", "third_party_data_import")
    .eq("locale", LOCALE)
    .eq("is_current", true)
    .maybeSingle();
  if (documentError) return apiError(500, "INTERNAL_ERROR", documentError.message);
  if (!currentDocument) {
    console.error("[data/connections/authorize] aucun document 'third_party_data_import' is_current=true.");
    return apiError(503, "CONSENT_DOCUMENT_UNAVAILABLE", "Ce document de consentement n'est pas encore disponible dans cet environnement.");
  }

  const consentOk = await hasActiveConsent(supabase, user.id, "third_party_data_import");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement à l'import depuis une source tierce est requis avant de connecter Strava.");
  }

  // Réouvre/crée la ligne `pending` sans jamais violer `data_connections_one_live_per_provider`
  // (index unique partiel, `0018_data_connections.sql`) : une reconnexion après révocation, ou une
  // nouvelle tentative depuis `needs_reauth`, réutilise la ligne déjà vivante s'il y en a une.
  const { data: existing, error: existingError } = await admin
    .from("data_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_code", provider)
    .in("status", ["pending", "active", "needs_reauth"])
    .maybeSingle();
  if (existingError) return apiError(500, "INTERNAL_ERROR", existingError.message);

  if (!existing) {
    const { error: insertError } = await admin.from("data_connections").insert({ user_id: user.id, provider_code: provider, status: "pending" });
    if (insertError) return apiError(500, "INTERNAL_ERROR", insertError.message);
  }

  const state = createSignedState({ userId: user.id, provider });
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/v1/data/connections/strava/callback`;
  const authorizeUrl = buildAuthorizeUrl({ state, redirectUri });

  const body: AuthorizeConnectionResponse = { authorizeUrl, state };
  return apiJson(body);
}
