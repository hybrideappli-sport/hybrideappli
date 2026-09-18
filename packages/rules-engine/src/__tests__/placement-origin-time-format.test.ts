/**
 * Une séance replacée sur son créneau d'origine est `scheduled`, jamais `moved` — quel que soit le
 * FORMAT dans lequel l'origine arrive.
 *
 * C'est le garde-fou précis du bug du 2026-09-18. `place-week-sessions.ts` comparait
 * `formatTime(chosen.startMin)` — `"07:00"` — à `origin.time`. Or les deux seuls appelants qui
 * relisent une origine depuis la base (`resolveScheduleIncident()` et le job `refresh_placements`)
 * la reçoivent d'une colonne `time without time zone`, que Postgres sérialise `"07:00:00"`,
 * secondes comprises. L'égalité de chaînes était donc TOUJOURS fausse, la séance était étiquetée
 * `moved`, et la base refusait l'insertion — `session_placements_moved_differs_from_origin` exige
 * qu'un `moved` diffère réellement de son origine.
 *
 * Ce test vit au niveau du MOTEUR parce que c'est là que les deux chemins convergent : les couvrir
 * tous les deux en intégration demanderait de reproduire un scénario de retour à l'origine propre
 * à chacun, alors que la décision fautive est la même ligne de code.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

/** Le créneau que le moteur retiendra, exprimé dans les deux formats qu'il peut recevoir. */
const HEURE_MOTEUR = "07:00"; // `formatTime()` — origine reconstruite en mémoire (`regeneratePlan`)
const HEURE_BASE = "07:00:00"; // Postgres `time` — origine relue (`refresh_placements`, incident)

function placerSurOrigine(originTime: string) {
  const input = buildPlacementInput({
    calendar: [{ weekday: 1, slot: "am", isAvailable: true, maxMinutes: 120 }],
    triggerReason: "availability_changed",
    incidentId: null,
    incidentWindows: [],
    frozenOccupancy: [],
    sessions: [
      buildSession({
        sessionId: "s-origine",
        scheduledDate: WEEK_START,
        slot: "am",
        durationMin: 30,
        origin: { date: WEEK_START, time: originTime },
      }),
    ],
  });
  return placeWeekSessions(input, RULESET_FOR_PLACEMENT).decisions[0]!;
}

describe("placeWeekSessions — format de l'heure d'origine (ADR-016)", () => {
  it("reconnaît le créneau d'origine quand l'heure arrive au format du moteur (HH:MM)", () => {
    const decision = placerSurOrigine(HEURE_MOTEUR);

    expect(decision.date).toBe(WEEK_START);
    expect(decision.startTime).toBe(HEURE_MOTEUR);
    expect(decision.status).toBe("scheduled");
  });

  it("reconnaît le MÊME créneau quand l'heure arrive au format de la base (HH:MM:SS)", () => {
    const decision = placerSurOrigine(HEURE_BASE);

    // Même créneau retenu que ci-dessus : seule la forme de l'origine diffère.
    expect(decision.date).toBe(WEEK_START);
    expect(decision.startTime).toBe(HEURE_MOTEUR);

    // Le cœur du test. Avant correction, la comparaison de chaînes donnait `"07:00" !== "07:00:00"`
    // et ce statut valait `moved` — pour une séance qui n'avait pas bougé d'une minute.
    expect(decision.status).toBe("scheduled");
  });

  it("produit bien 'moved' quand le créneau retenu diffère réellement de l'origine", () => {
    // Contre-épreuve : la correction ne doit pas rendre tout `scheduled` par excès.
    const decision = placerSurOrigine("18:30:00");

    expect(decision.startTime).not.toBe("18:30");
    expect(decision.status).toBe("moved");
  });
});
