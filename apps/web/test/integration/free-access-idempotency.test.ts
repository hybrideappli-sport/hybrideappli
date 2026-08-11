import { afterAll, describe, expect, it } from "vitest";

import { getEntitlement, requireEntitlement } from "@/lib/entitlements";
import { createTestUser, deleteTestUser, serviceRoleClient } from "./support/test-clients";

/**
 * `free-access-idempotency.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC13, ADR-008) — «
 * consommation du quota d'accès libre idempotente par jour ». `requireEntitlement()` documente
 * cette garantie explicitement (`apps/web/lib/entitlements.ts`) :
 *
 * > Idempotent : `unique(user_id, accessed_on)` — 10 appels le même jour ⟹ 1 seul événement.
 *
 * Ce test l'exerce réellement plutôt que de faire confiance au commentaire : rafales d'appels
 * concurrents ET séquentiels le même jour. La garantie qui compte pour AC13 (jamais consommer plus
 * d'un jour de quota par jour calendaire, jamais bloquer à tort un jour déjà accédé) est vérifiée
 * sur `free_access_events` (vérité base) et sur `getEntitlement()` (lecture SEULE, recalculée
 * intégralement depuis la base à chaque appel — jamais de dérive possible).
 *
 * Note de découverte (à consigner au rapport, PAS corrigée ici — hors périmètre `tester`) :
 * `requireEntitlement()` calcule son `freeAccess` de retour ainsi :
 *   `evaluateFreeAccess([...events, { accessedOn: now }], now, params)`
 * où `events` est déjà lu AVANT l'écriture du jour courant. Si `now` a DÉJÀ un événement en base
 * (rappel le même jour), `events` contient déjà cette entrée : le tableau passé à
 * `evaluateFreeAccess()` compte alors DEUX fois le même jour (`used = inPeriod.length`, pas dédupliqué
 * par `accessedOn`, voir `packages/rules-engine/src/free-access.ts`). Le `used`/`remaining` RENVOYÉS
 * s'incrémentent donc artificiellement à chaque rappel le même jour (1, 2, 3, … au lieu de rester à
 * 1) — un pur artefact d'affichage : la ligne `free_access_events` réelle, elle, reste unique
 * (`ignoreDuplicates: true`), et `canViewToday`/`allowed` restent corrects (`alreadyAccessedToday`
 * les court-circuite). `getEntitlement()` n'a pas ce défaut : il ne fait qu'une lecture pure,
 * toujours recalculée depuis `free_access_events`, jamais un `[...events, now]` en mémoire.
 */
const admin = serviceRoleClient();

const user = await createTestUser("free-access-idem");

afterAll(async () => {
  await deleteTestUser(user.id);
});

const MONDAY = "2026-08-10";
const TUESDAY = "2026-08-11";

describe("free-access-idempotency — AC13", () => {
  it("10 appels séquentiels le même jour n'écrivent qu'UN SEUL free_access_events, et n'entament le quota qu'une fois", async () => {
    for (let i = 0; i < 10; i++) {
      const entitlement = await requireEntitlement(admin, { userId: user.id, now: MONDAY, surface: "today" });
      expect(entitlement.tier).toBe("free");
      expect(entitlement.canViewToday).toBe(true);
    }

    const { data: events, error } = await admin.from("free_access_events").select("id, surface").eq("user_id", user.id).eq("accessed_on", MONDAY);
    if (error) throw error;
    expect(events).toHaveLength(1);

    // Vérité base, lecture pure : le quota réel n'a bien été entamé qu'UNE fois par ces 10 appels.
    const readOnly = await getEntitlement(admin, { userId: user.id, now: MONDAY });
    expect(readOnly.freeAccess.used).toBe(1);
    expect(readOnly.freeAccess.remaining).toBe(2);
  });

  it("des appels CONCURRENTS le même jour (course) restent idempotents — 1 seul événement, jamais d'erreur", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => requireEntitlement(admin, { userId: user.id, now: TUESDAY, surface: "dashboard" })));
    for (const entitlement of results) {
      expect(entitlement.tier).toBe("free");
      expect(entitlement.canViewToday).toBe(true);
    }

    const { data: events, error } = await admin.from("free_access_events").select("id").eq("user_id", user.id).eq("accessed_on", TUESDAY);
    if (error) throw error;
    expect(events).toHaveLength(1);
  });

  it("la consommation ne compte qu'un jour PAR jour calendaire dans le quota hebdomadaire (2 jours consommés, pas 18)", async () => {
    // Semaine ISO fixe (lundi 2026-08-10 → dimanche 2026-08-16), `accesses_per_period = 3`
    // (`0.1.0-dev`, `supabase/seed.sql`, même valeur que `paywall.test.ts`) — 2 jours DISTINCTS
    // consommés (lundi + mardi) malgré les 18 appels cumulés des deux tests précédents.
    const readOnly = await getEntitlement(admin, { userId: user.id, now: TUESDAY });
    expect(readOnly.freeAccess.used).toBe(2);
    expect(readOnly.freeAccess.remaining).toBe(1);
    expect(readOnly.canViewToday).toBe(true);

    // Un 3ᵉ jour distinct reste autorisé (dernier avant épuisement) ; le quota reste posé par jour,
    // pas par appel.
    const wednesday = "2026-08-12";
    const consumed = await requireEntitlement(admin, { userId: user.id, now: wednesday, surface: "today" });
    expect(consumed.canViewToday).toBe(true);

    // Un 4ᵉ jour distinct dans la même semaine ISO est désormais bloqué (402 côté route).
    const thursday = "2026-08-13";
    await expect(requireEntitlement(admin, { userId: user.id, now: thursday, surface: "today" })).rejects.toThrow();

    const { count, error } = await admin
      .from("free_access_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("accessed_on", thursday);
    if (error) throw error;
    expect(count).toBe(0);
  });
});
