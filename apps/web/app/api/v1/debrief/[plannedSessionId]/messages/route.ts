import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { z } from "zod";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { DebriefChoiceSchema } from "@/lib/debrief/closed-questions";
import type { DebriefTurnResponse } from "@/lib/debrief/types";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import {
  applyDebriefChoiceForSession,
  DebriefLlmUnavailableError,
  DebriefSessionNotFoundError,
  runDebriefTurnForSession,
  type DebriefTurnOutcome,
} from "@/lib/orchestration/run-debrief-turn";
import { NoActivePlanError, SessionLogPersistenceError } from "@/lib/orchestration/run-session-log-signal-pipeline";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { DebriefLogValidationError } from "@/lib/orchestration/write-debrief-log";

export const dynamic = "force-dynamic";

/** Un message libre, compris par le LLM ; OU un choix par chips, qui ne passe pas par lui. */
const BodySchema = z.union([
  z.object({ content: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ choice: DebriefChoiceSchema }).strict(),
]);

/**
 * `POST /api/v1/debrief/:plannedSessionId/messages` — un tour de débrief post-séance
 * (US-05, ADR-019).
 *
 * Réponse JSON simple, pas un flux SSE comme `/onboarding/session/:id/messages` : un tour de débrief
 * tient en deux phrases (prompt §5), et l'indicateur « le coach écrit » couvre l'attente. Tranché au
 * Lot L3, avec l'écran.
 *
 * Consentement santé vérifié AVANT le tour, même contrat que `POST /session-logs` : un tour peut
 * écrire le réalisé (Lot L2), et `debrief_messages`, présumé porter de la donnée de santé, s'écrit en
 * `service_role`, donc hors de portée des policies.
 *
 * Paywall (ADR-019 §8) : la conversation n'existe que sur `/aujourdhui` débloqué. Un utilisateur
 * bloqué garde le formulaire, et cette route le refuse AVANT tout appel LLM. `requireEntitlement()`
 * est idempotent par jour : l'écran `/aujourdhui` a déjà consommé l'accès du jour, cet appel n'en
 * consomme pas un second.
 *
 * Échec du fournisseur LLM ⟹ `503 LLM_UNAVAILABLE` : l'écran bascule sur le formulaire.
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
    await requireEntitlement(admin, { userId: user.id, now, surface: "today" });
  } catch (error) {
    if (error instanceof PaywallRequiredError) {
      return apiError(402, "PAYWALL_REQUIRED", "Le débrief avec le coach n'est pas disponible : ta saisie reste possible par le formulaire.");
    }
    throw error;
  }

  let turn: DebriefTurnOutcome;
  try {
    turn =
      "content" in parsed.data
        ? await runDebriefTurnForSession(supabase, admin, { userId: user.id, plannedSessionId, userMessage: parsed.data.content, now })
        : await applyDebriefChoiceForSession(supabase, admin, { userId: user.id, plannedSessionId, choice: parsed.data.choice, now });
  } catch (error) {
    if (error instanceof DebriefSessionNotFoundError) return apiError(404, "NOT_FOUND", "Séance introuvable.");
    if (error instanceof DebriefLlmUnavailableError) {
      return apiError(503, "LLM_UNAVAILABLE", "Le coach ne peut pas répondre pour le moment.");
    }
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

  return apiJson<DebriefTurnResponse>(
    {
      debriefSessionId: turn.debriefSessionId,
      reply: turn.reply,
      isReformulation: turn.isReformulation,
      canClose: turn.canClose,
      reachedTurnLimit: turn.reachedTurnLimit,
      closedQuestion: turn.closedQuestion,
      sessionLogId: turn.sessionLogId,
      // Le résultat du pipeline de CE tour : l'écran doit afficher un renvoi médical (AC9) ou
      // l'explication d'un ajustement au moment où ils se produisent.
      logWrite: turn.logWrite ? { kind: turn.logWrite.kind, result: turn.logWrite.result } : null,
      painZone: turn.draft.painZone ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

