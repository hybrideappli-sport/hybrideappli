import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/account/export` (art. 15/20 RGPD, `08-architecture.md` §6.7) — export JSON
 * intégral des données personnelles de l'utilisateur courant : profil, plans/versions/séances/
 * nutrition, saisies quotidiennes, traces de décision, explications, consentements, abonnement,
 * sources de données connectées et scores hybrides (US-02, `08-architecture.md` §13.3).
 *
 * Lit exclusivement via le client `rls` (authentifié, cookie de session) — PAS `service_role` :
 * chaque table exportée porte déjà une policy `select ... using (user_id = auth.uid())`
 * (`docs/db-schema.md` §5.1), donc utiliser le client RLS garantit par construction qu'aucune
 * ligne d'un AUTRE utilisateur ne peut jamais apparaître dans cet export, y compris en cas de bug
 * de filtrage applicatif (défense en profondeur — la même raison que `complete-onboarding.ts`
 * écrit `athlete_profiles` avec le client RLS plutôt que `service_role`).
 *
 * Hors périmètre, volontairement (à documenter si contesté) :
 *   - `stripe_events` : payloads Stripe bruts, sans `user_id` exploitable côté RLS, couverts par
 *     leur propre politique de rétention/purge (finding I3) plutôt que par cet export.
 *   - `job_queue` : file d'exécution interne, pas une donnée personnelle au sens RGPD.
 *   - `plan_reviews` : revue qualité interne (rôle `staff`), pas une saisie de l'utilisateur.
 *   - Factures Stripe : déjà exposées telles quelles par `GET /api/v1/billing/invoices`.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const uid = user.id;

  const [
    profile,
    athleteProfile,
    athleteSports,
    availabilitySlots,
    objectives,
    riskFlags,
    onboardingSessions,
    onboardingMessages,
    consents,
    plans,
    planVersions,
    planBlocks,
    planWeeks,
    plannedSessions,
    nutritionDays,
    planDiffs,
    sessionLogs,
    nutritionCheckins,
    bodyMetrics,
    painEpisodes,
    stagnationDiagnoses,
    engineRuns,
    decisionTraces,
    explanations,
    subscriptions,
    freeAccessEvents,
    notifications,
    pushSubscriptions,
    dataConnections,
    syncRuns,
    hybridScores,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("athlete_profiles").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("athlete_sports").select("*, sports(code, label_fr)").eq("user_id", uid),
    supabase.from("availability_slots").select("*").eq("user_id", uid),
    supabase.from("objectives").select("*").eq("user_id", uid),
    supabase.from("risk_flags").select("id, flag_type, declared_at, source, restrictions, is_active, resolved_at, created_at").eq("user_id", uid),
    supabase.from("onboarding_sessions").select("*").eq("user_id", uid),
    supabase.from("onboarding_messages").select("*").eq("user_id", uid),
    supabase.from("consents").select("*").eq("user_id", uid),
    supabase.from("plans").select("*").eq("user_id", uid),
    supabase.from("plan_versions").select("*").eq("user_id", uid),
    supabase.from("plan_blocks").select("*").eq("user_id", uid),
    supabase.from("plan_weeks").select("*").eq("user_id", uid),
    supabase.from("planned_sessions").select("*").eq("user_id", uid),
    supabase.from("nutrition_days").select("*").eq("user_id", uid),
    supabase.from("plan_diffs").select("*").eq("user_id", uid),
    supabase.from("session_logs").select("*").eq("user_id", uid),
    supabase.from("nutrition_checkins").select("*").eq("user_id", uid),
    supabase.from("body_metrics").select("*").eq("user_id", uid),
    supabase.from("pain_episodes").select("*").eq("user_id", uid),
    supabase.from("stagnation_diagnoses").select("*").eq("user_id", uid),
    supabase.from("engine_runs").select("*").eq("user_id", uid),
    supabase.from("decision_traces").select("*").eq("user_id", uid),
    supabase.from("explanations").select("*").eq("user_id", uid),
    supabase.from("subscriptions").select("*").eq("user_id", uid),
    supabase.from("free_access_events").select("*").eq("user_id", uid),
    supabase.from("notifications").select("*").eq("user_id", uid),
    supabase.from("push_subscriptions").select("*").eq("user_id", uid),
    // US-02 — `data_connections` (JAMAIS `data_connection_secrets`, table intégralement hors
    // portée de `authenticated`, ADR-013 §2 : aucune policy, `revoke all`), `sync_runs`,
    // `hybrid_scores` (`08-architecture.md` §13.3, `docs/db-schema.md` §11 T30).
    supabase.from("data_connections").select("*").eq("user_id", uid),
    supabase.from("sync_runs").select("*").eq("user_id", uid),
    supabase.from("hybrid_scores").select("*").eq("user_id", uid),
  ]);

  const errored = [
    profile,
    athleteProfile,
    athleteSports,
    availabilitySlots,
    objectives,
    riskFlags,
    onboardingSessions,
    onboardingMessages,
    consents,
    plans,
    planVersions,
    planBlocks,
    planWeeks,
    plannedSessions,
    nutritionDays,
    planDiffs,
    sessionLogs,
    nutritionCheckins,
    bodyMetrics,
    painEpisodes,
    stagnationDiagnoses,
    engineRuns,
    decisionTraces,
    explanations,
    subscriptions,
    freeAccessEvents,
    notifications,
    pushSubscriptions,
    dataConnections,
    syncRuns,
    hybridScores,
  ].find((result) => result.error);
  if (errored?.error) return apiError(500, "INTERNAL_ERROR", errored.error.message);

  return apiJson(
    {
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      athleteProfile: athleteProfile.data,
      athleteSports: athleteSports.data,
      availabilitySlots: availabilitySlots.data,
      objectives: objectives.data,
      riskFlags: riskFlags.data,
      onboardingSessions: onboardingSessions.data,
      onboardingMessages: onboardingMessages.data,
      consents: consents.data,
      plans: plans.data,
      planVersions: planVersions.data,
      planBlocks: planBlocks.data,
      planWeeks: planWeeks.data,
      plannedSessions: plannedSessions.data,
      nutritionDays: nutritionDays.data,
      planDiffs: planDiffs.data,
      sessionLogs: sessionLogs.data,
      nutritionCheckins: nutritionCheckins.data,
      bodyMetrics: bodyMetrics.data,
      painEpisodes: painEpisodes.data,
      stagnationDiagnoses: stagnationDiagnoses.data,
      engineRuns: engineRuns.data,
      decisionTraces: decisionTraces.data,
      explanations: explanations.data,
      subscriptions: subscriptions.data,
      freeAccessEvents: freeAccessEvents.data,
      notifications: notifications.data,
      pushSubscriptions: pushSubscriptions.data,
      dataConnections: dataConnections.data,
      syncRuns: syncRuns.data,
      hybridScores: hybridScores.data,
    },
    { headers: { "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=hybride-export.json" } },
  );
}
