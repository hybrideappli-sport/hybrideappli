import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { EntitlementView, FreeAccessEvent, FreeAccessParamsInput, FreeAccessResult, Ruleset } from "@hybride/domain";
import { evaluateFreeAccess } from "@hybride/rules-engine";

import { addDaysIso } from "./dates";
import { getActiveRuleset } from "./orchestration/get-active-ruleset";

/**
 * `entitlements.ts` — AC13, ADR-008. Autorité UNIQUE du paywall (`08-architecture.md` §3.3) : posé
 * AVANT tout écran de la boucle quotidienne (plan §6 étape 21), pour ne jamais avoir à « rajouter
 * le paywall après ». Chaque Route Handler de lecture de plan appelle `requireEntitlement()`
 * **avant** toute requête de données — un utilisateur libre ne reçoit jamais le contenu complet
 * dans le payload, même masqué côté client.
 */

export class PaywallRequiredError extends Error {
  constructor(public readonly entitlement: EntitlementView) {
    super("Accès libre épuisé pour cette période, ou fonctionnalité réservée aux abonnés (AC13).");
  }
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

async function readTier(admin: SupabaseClient<Database>, userId: string): Promise<"free" | "premium"> {
  const { data, error } = await admin.from("subscriptions").select("tier, status").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`entitlements: subscriptions — ${error.message}`);
  if (!data) return "free"; // pas de ligne = jamais souscrit, `subscriptions.tier` par défaut `'free'`.
  if (data.tier === "premium" && data.status !== null && ACTIVE_SUBSCRIPTION_STATUSES.has(data.status)) return "premium";
  return "free";
}

function freeAccessParams(ruleset: Ruleset): FreeAccessParamsInput {
  return {
    accessesPerPeriod: ruleset.params.free_access.accesses_per_period,
    windowStrategy: ruleset.params.free_access.window_strategy,
  };
}

/** Fenêtre la plus large possible (`fixed_week` ou `rolling_7d`, ADR-008 §3) tient en 7 jours. */
async function fetchRecentEvents(admin: SupabaseClient<Database>, userId: string, now: string): Promise<FreeAccessEvent[]> {
  const earliestPossible = addDaysIso(now, -7);
  const { data, error } = await admin
    .from("free_access_events")
    .select("accessed_on")
    .eq("user_id", userId)
    .gte("accessed_on", earliestPossible)
    .lte("accessed_on", now);
  if (error) throw new Error(`entitlements: free_access_events (lecture) — ${error.message}`);
  return (data ?? []).map((row) => ({ accessedOn: row.accessed_on }));
}

function buildEntitlement(tier: "free" | "premium", access: FreeAccessResult): EntitlementView {
  return {
    tier,
    canViewToday: tier === "premium" || access.allowed,
    canViewWeek: tier === "premium",
    canViewMacro: tier === "premium",
    freeAccess: {
      used: access.used,
      remaining: access.remaining,
      periodStart: access.periodStart,
      periodEnd: access.periodEnd,
      resetsAt: access.resetsAt,
    },
  };
}

const UNLIMITED_ACCESS: FreeAccessResult = {
  allowed: true,
  used: 0,
  remaining: Number.POSITIVE_INFINITY,
  periodStart: "",
  periodEnd: "",
  resetsAt: "",
};

/**
 * Lecture SEULE — ne consomme jamais d'accès libre. Utilisée par l'UI (bandeau upsell, compteur
 * d'accès, `PaywallGate`) qui a besoin de connaître l'état du paywall sans le déclencher.
 */
export async function getEntitlement(admin: SupabaseClient<Database>, args: { userId: string; now: string }): Promise<EntitlementView> {
  const { userId, now } = args;
  const tier = await readTier(admin, userId);
  if (tier === "premium") return buildEntitlement(tier, { ...UNLIMITED_ACCESS, periodStart: now, periodEnd: now, resetsAt: now });

  const ruleset = await getActiveRuleset(admin);
  const events = await fetchRecentEvents(admin, userId, now);
  const access = evaluateFreeAccess(events, now, freeAccessParams(ruleset));
  return buildEntitlement(tier, access);
}

/**
 * `requireEntitlement()` — LA porte d'entrée du paywall (§3.3). Écrit `free_access_events`
 * (`surface`) si et seulement si `tier = 'free'` ET que l'accès est encore permis pour la période
 * en cours ; lève `PaywallRequiredError` sinon (`402 PAYWALL_REQUIRED` côté Route Handler). Un
 * utilisateur `premium` ne consomme jamais le journal (ADR-008).
 */
export async function requireEntitlement(
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; surface: "dashboard" | "today" },
): Promise<EntitlementView> {
  const { userId, now, surface } = args;
  const tier = await readTier(admin, userId);

  if (tier === "premium") {
    return buildEntitlement(tier, { ...UNLIMITED_ACCESS, periodStart: now, periodEnd: now, resetsAt: now });
  }

  const ruleset = await getActiveRuleset(admin);
  const params = freeAccessParams(ruleset);
  const events = await fetchRecentEvents(admin, userId, now);
  const before = evaluateFreeAccess(events, now, params);

  if (!before.allowed) {
    throw new PaywallRequiredError(buildEntitlement(tier, before));
  }

  // Idempotent : `unique(user_id, accessed_on)` — 10 appels le même jour ⟹ 1 seul événement
  // (`free-access-idempotency.test.ts`, §4.3 du plan). Écriture `service_role` uniquement : le
  // quota n'est jamais manipulable par le client (`docs/db-schema.md` §7).
  const { error } = await admin
    .from("free_access_events")
    .upsert({ user_id: userId, accessed_on: now, surface }, { onConflict: "user_id,accessed_on", ignoreDuplicates: true });
  if (error) throw new Error(`requireEntitlement: free_access_events (écriture) — ${error.message}`);

  const after = evaluateFreeAccess([...events, { accessedOn: now }], now, params);
  return buildEntitlement(tier, after);
}
