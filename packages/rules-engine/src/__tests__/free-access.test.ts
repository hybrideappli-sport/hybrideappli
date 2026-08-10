/**
 * AC13 / ADR-008 — `evaluateFreeAccess` sur les deux stratégies
 * (`fixed_week`, `rolling_7d`) à partir du même journal d'événements.
 */

import { describe, expect, it } from "vitest";
import { evaluateFreeAccess } from "../free-access.js";

describe("evaluateFreeAccess — AC13", () => {
  it("fixed_week : autorisé tant que le quota de la semaine (lundi-dimanche) n'est pas atteint", () => {
    const events = [{ accessedOn: "2026-08-10" }, { accessedOn: "2026-08-11" }]; // lundi, mardi
    const result = evaluateFreeAccess(events, "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "fixed_week" });
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
    expect(result.remaining).toBe(1);
    expect(result.periodStart).toBe("2026-08-10");
    expect(result.periodEnd).toBe("2026-08-16");
  });

  it("fixed_week : bloqué au-delà de 3 accès dans la semaine, sauf le jour déjà consommé", () => {
    const events = [{ accessedOn: "2026-08-10" }, { accessedOn: "2026-08-11" }, { accessedOn: "2026-08-12" }];
    const blocked = evaluateFreeAccess(events, "2026-08-13", { accessesPerPeriod: 3, windowStrategy: "fixed_week" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Le jour DÉJÀ consommé reste consultable (pas de blocage a posteriori le même jour).
    const sameDay = evaluateFreeAccess(events, "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "fixed_week" });
    expect(sameDay.allowed).toBe(true);
  });

  it("rolling_7d : la fenêtre glisse sur les 7 derniers jours, pas sur la semaine calendaire", () => {
    const events = [{ accessedOn: "2026-08-05" }, { accessedOn: "2026-08-06" }, { accessedOn: "2026-08-07" }];
    // 2026-08-12 - 6 jours = 2026-08-06 : le 05/08 sort de la fenêtre glissante.
    const result = evaluateFreeAccess(events, "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "rolling_7d" });
    expect(result.used).toBe(2);
    expect(result.periodStart).toBe("2026-08-06");
    expect(result.periodEnd).toBe("2026-08-12");
  });

  it("les deux stratégies partent du même journal et produisent des résultats différents mais cohérents", () => {
    const events = [{ accessedOn: "2026-08-09" }, { accessedOn: "2026-08-10" }, { accessedOn: "2026-08-11" }];
    const fixedWeek = evaluateFreeAccess(events, "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "fixed_week" });
    const rolling = evaluateFreeAccess(events, "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "rolling_7d" });
    // fixed_week : semaine du 10 au 16 ⟹ seuls 10 et 11 comptent (2 accès).
    // rolling_7d : fenêtre du 06 au 12 ⟹ 09, 10 et 11 comptent (3 accès).
    expect(fixedWeek.used).toBe(2);
    expect(rolling.used).toBe(3);
    expect(fixedWeek.allowed).toBe(true);
    expect(rolling.allowed).toBe(false);
  });

  it("aucun accès enregistré ⟹ quota complet disponible", () => {
    const result = evaluateFreeAccess([], "2026-08-12", { accessesPerPeriod: 3, windowStrategy: "fixed_week" });
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(3);
    expect(result.allowed).toBe(true);
  });
});
