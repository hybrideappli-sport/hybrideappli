import { afterAll, describe, expect, it } from "vitest";

import { getEntitlement, PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { createTestUser, deleteTestUser, serviceRoleClient } from "./support/test-clients";

/**
 * `paywall.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC13) — « 4ᵉ jour d'accès ⟹ 402 ;
 * /plan/week en free ⟹ 402 ; contenu semaine absent du payload ».
 *
 * Exerce `requireEntitlement()`/`getEntitlement()` directement — l'AUTORITÉ unique du paywall
 * (`08-architecture.md` §3.3), commune à TOUTES les routes de lecture de plan — plutôt que chaque
 * route HTTP individuellement : les Route Handlers eux-mêmes dépendent de `next/headers`
 * (`requireUser()` → cookies de session), qui n'existe que dans un vrai contexte de requête Next
 * (couvert par `e2e/paywall.spec.ts`, qui exerce le parcours HTTP complet via un navigateur réel).
 * Ce test couvre la RÈGLE elle-même : `/plan/week` (`app/api/v1/plan/week/route.ts`) fait
 * strictement `if (!entitlement.canViewWeek) return apiError(402, ...)` AVANT tout accès aux
 * données de la semaine — un `canViewWeek === false` prouvé ici garantit structurellement qu'aucun
 * contenu de semaine n'atteint jamais le payload pour un utilisateur `free`, indépendamment de
 * l'état de son quota d'accès libre au jour.
 *
 * `accessesPerPeriod = 3`, `window_strategy = 'fixed_week'` — valeurs réellement seedées
 * (`0.1.0-dev`, `supabase/seed.sql`), pas une hypothèse du test.
 */
const admin = serviceRoleClient();

const user = await createTestUser("paywall");

afterAll(async () => {
  await deleteTestUser(user.id);
});

// Semaine ISO fixe (lundi 2026-08-10 → dimanche 2026-08-16) — un utilisateur `free` par défaut
// (aucune ligne `subscriptions`, voir `readTier()`).
const MONDAY = "2026-08-10";
const TUESDAY = "2026-08-11";
const WEDNESDAY = "2026-08-12";
const THURSDAY = "2026-08-13";

describe("paywall — AC13", () => {
  it("3 accès/semaine consommés jour après jour, le 4ᵉ jour de la même semaine ISO est bloqué (402)", async () => {
    for (const day of [MONDAY, TUESDAY, WEDNESDAY]) {
      const entitlement = await requireEntitlement(admin, { userId: user.id, now: day, surface: "today" });
      expect(entitlement.tier).toBe("free");
      expect(entitlement.canViewToday).toBe(true);
    }

    await expect(requireEntitlement(admin, { userId: user.id, now: THURSDAY, surface: "today" })).rejects.toBeInstanceOf(PaywallRequiredError);

    const { data: events, error } = await admin.from("free_access_events").select("accessed_on").eq("user_id", user.id).order("accessed_on");
    if (error) throw error;
    expect(events).toHaveLength(3);
    expect(events!.map((e) => e.accessed_on)).toEqual([MONDAY, TUESDAY, WEDNESDAY]);
  });

  it("le 4ᵉ appel n'écrit AUCUN free_access_events supplémentaire (le blocage précède toute écriture)", async () => {
    const { count, error } = await admin
      .from("free_access_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("accessed_on", THURSDAY);
    if (error) throw error;
    expect(count).toBe(0);
  });

  it("un utilisateur `free` n'a jamais accès à la vue semaine ou macro, quel que soit son quota quotidien restant", async () => {
    // Quota du jour encore disponible (aucun accès consommé pour `now`) : `canViewWeek`/`canViewMacro`
    // restent `false` — ce ne sont PAS des dérivés du quota d'accès libre au jour, mais du `tier`
    // seul (`buildEntitlement()`, `apps/web/lib/entitlements.ts`).
    const freshDay = "2026-08-20";
    const entitlement = await getEntitlement(admin, { userId: user.id, now: freshDay });
    expect(entitlement.tier).toBe("free");
    expect(entitlement.canViewWeek).toBe(false);
    expect(entitlement.canViewMacro).toBe(false);
  });
});
