import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { z } from "zod";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import { DebriefSessionNotFoundError, runDebriefTurnForSession } from "@/lib/orchestration/run-debrief-turn";
import { NoActivePlanError, SessionLogPersistenceError } from "@/lib/orchestration/run-session-log-signal-pipeline";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { DebriefLogValidationError } from "@/lib/orchestration/write-debrief-log";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ content: z.string().trim().min(1).max(2000) });

/**
 * `POST /api/v1/debrief/:plannedSessionId/messages` — un tour de débrief post-séance
 * (US-05, Lot L1, ADR-019).
 *
 * Ne consomme PAS d'accès libre, comme `POST /session-logs` : recueillir ce qui s'est passé n'est
 * pas consommer du contenu (ADR-008 §5).
 *
 * Portée du Lot L1 : la réponse est un JSON simple, pas un flux SSE comme
 * `/onboarding/session/:id/messages`. Le streaming est une question d'écran, tranchée au Lot L3
 * quand l'UI existera — l'imposer ici compliquerait une route que seuls des tests appellent.
 *
 * Lot L2 : un tour peut écrire le réalisé (écriture précoce, ADR-019 §3). D'où le même contrat de
 * consentement que `POST /session-logs`, vérifié AVANT le tour. Il protège aussi l'échange
 * lui-même : `debrief_messages` est présumé porter de la donnée de santé (`contains_health_data`
 * vaut `true` par défaut), et il est écrit en `service_role`, donc hors de portée des policies.
 */
export async function POST(request: Request, { params }: { params: Promise<{ plannedSessionId: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { plannedSessionId } = await params;
  if (!z.string().uuid().safeParse(plannedSessionId).success) {
    return apiError(400, "VALIDATION_FAILED", "Identifiant de séance invalide.");
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Message invalide.", parsed.error.flatten());

  const consentOk = await hasActiveConsent(supabase, user.id, "health_data_processing");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement au traitement des données de santé est requis pour ce débrief.");
  }

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();
  try {
    const turn = await runDebriefTurnForSession(supabase, admin, {
      userId: user.id,
      plannedSessionId,
      userMessage: parsed.data.content,
      now,
    });
    return apiJson({
      debriefSessionId: turn.debriefSessionId,
      reply: turn.reply,
      isReformulation: turn.isReformulation,
      missingMandatory: turn.missingMandatory,
      missingDesired: turn.missingDesired,
      canClose: turn.canClose,
      reachedTurnLimit: turn.reachedTurnLimit,
      reachedReformulationLimit: turn.reachedReformulationLimit,
      sessionLogId: turn.sessionLogId,
      // Le résultat du pipeline de CE tour : l'écran doit afficher un renvoi médical (AC9) ou
      // l'explication d'un ajustement au moment où ils se produisent.
      logWrite: turn.logWrite
        ? { kind: turn.logWrite.kind, painProtocol: turn.logWrite.result.painProtocol, adjustment: turn.logWrite.result.adjustment }
        : null,
    });
  } catch (error) {
    if (error instanceof DebriefSessionNotFoundError) return apiError(404, "NOT_FOUND", "Séance introuvable.");
    // L'échange est déjà persisté quand l'écriture échoue : le prochain tour la retentera.
    if (error instanceof SessionLogPersistenceError) {
      if (error.message.toLowerCase().includes("row-level security")) {
        return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
      }
      return apiError(500, "INTERNAL_ERROR", error.message);
    }
    if (error instanceof DebriefLogValidationError) return apiError(500, "INTERNAL_ERROR", error.message);
    if (error instanceof NoActivePlanError) return apiError(409, "CONFLICT", error.message);
    throw error;
  }
}
