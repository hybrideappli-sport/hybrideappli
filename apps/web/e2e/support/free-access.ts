import { createServiceRoleClient } from "./test-user";

// Duplique volontairement `apps/web/lib/orchestration/today-in-timezone.ts` (même rationale de
// duplication que `daily-loop-flow.ts`).
function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Simule un quota d'accès libre déjà épuisé pour AUJOURD'HUI (AC13 — `window_strategy = 'fixed_week'`,
 * `supabase/seed.sql`).
 *
 * Piège évité (documenté ici plutôt que laissé implicite) : une fixture naïve « insère 3
 * `free_access_events` sur 3 jours distincts de la semaine ISO courante » n'est PAS déterministe
 * — `evaluateFreeAccess()` calcule une période `fixed_week` qui va du lundi au dimanche de la
 * semaine courante (`periodEnd` peut donc tomber APRÈS aujourd'hui), mais
 * `apps/web/lib/entitlements.ts::fetchRecentEvents()` ne charge QUE les événements
 * `accessed_on <= now` (hypothèse valide en usage réel — on n'accède jamais dans le futur — mais
 * qui exclut silencieusement toute date future-dans-la-semaine qu'une fixture de test y placerait).
 * Concrètement : avant jeudi d'une semaine ISO donnée, il n'existe tout simplement PAS 3 jours
 * DISTINCTS et PASSÉS dans la semaine courante pour porter 3 accès réalistes — ce n'est pas une
 * limite de ce fixture, c'est une PROPRIÉTÉ RÉELLE du produit (`accesses_per_period = 3` ne peut
 * matériellement pas être atteint avant le 3ᵉ jour de la semaine).
 *
 * Fixture retenue, robuste quel que soit le jour d'exécution du test — y compris un lundi, où même
 * `accesses_per_period = 1` en `fixed_week` serait irréaliste (`periodStart = aujourd'hui`, donc
 * AUCUN jour passé n'existe encore dans la période, quelle que soit la valeur du quota — le schéma
 * Zod interdit d'ailleurs `accesses_per_period = 0`, `RulesetParamsSchema.free_access`,
 * `packages/domain/src/ruleset.ts`) : bascule TEMPORAIREMENT le ruleset actif sur
 * `window_strategy = 'rolling_7d'` (fenêtre glissante des 7 derniers jours, TOUJOURS au moins 6
 * jours passés disponibles) avec `accesses_per_period = 1`, puis dépose un unique accès daté
 * d'hier. Restaurée par `restore()` — toujours appelée (`try/finally` côté spec) : les tests
 * s'exécutant en série sur ce projet Playwright (`fullyParallel: false, workers: 1`,
 * `playwright.config.ts`), la fenêtre de mutation partagée ne chevauche aucun autre test.
 */
export async function exhaustFreeAccessForUser(userId: string, timezone = "Europe/Paris"): Promise<{ restore: () => Promise<void> }> {
  const admin = createServiceRoleClient();

  const { data: ruleset, error: rulesetError } = await admin.from("rulesets").select("version, params").eq("is_active", true).single();
  if (rulesetError) throw new Error(`[e2e] exhaustFreeAccessForUser (lecture ruleset) : ${rulesetError.message}`);

  const originalParams = ruleset.params as { free_access: { accesses_per_period: number; window_strategy: string } };
  const patchedParams = { ...originalParams, free_access: { accesses_per_period: 1, window_strategy: "rolling_7d" } };

  const { error: updateError } = await admin.from("rulesets").update({ params: patchedParams }).eq("version", ruleset.version);
  if (updateError) throw new Error(`[e2e] exhaustFreeAccessForUser (patch ruleset) : ${updateError.message}`);

  // `alreadyAccessedToday` (ADR-008 : « 1 accès = 1 journée ») resterait vrai sinon — l'événement
  // du jour est déposé par `completeOnboardingToDashboard()`, qui visite déjà `/dashboard` une fois.
  const today = todayInTimezone(timezone);
  const { error: deleteError } = await admin.from("free_access_events").delete().eq("user_id", userId).eq("accessed_on", today);
  if (deleteError) throw new Error(`[e2e] exhaustFreeAccessForUser (purge du jour) : ${deleteError.message}`);

  const { error: insertError } = await admin
    .from("free_access_events")
    .insert({ user_id: userId, accessed_on: addDaysIso(today, -1), surface: "dashboard" });
  if (insertError) throw new Error(`[e2e] exhaustFreeAccessForUser (dépôt de l'accès d'hier) : ${insertError.message}`);

  return {
    restore: async () => {
      const { error } = await admin.from("rulesets").update({ params: originalParams }).eq("version", ruleset.version);
      if (error) throw new Error(`[e2e] restoreFreeAccessQuota : ${error.message}`);
    },
  };
}
