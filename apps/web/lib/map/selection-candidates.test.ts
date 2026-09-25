import { describe, expect, it } from "vitest";

import { cycleSelectionCandidate, orderSelectionCandidates, type SelectionCandidate } from "./selection-candidates";

describe("orderSelectionCandidates (design-carte.md §5.4.1)", () => {
  it("les itinéraires nommés passent toujours avant les segments, quelle que soit la distance", () => {
    const candidates: SelectionCandidate[] = [
      { osmId: "way/1", isNamedRoute: false, distancePx: 0 },
      { osmId: "relation/9", isNamedRoute: true, distancePx: 20 },
    ];
    expect(orderSelectionCandidates(candidates).map((c) => c.osmId)).toEqual(["relation/9", "way/1"]);
  });

  it("à isNamedRoute égal, distance croissante", () => {
    const candidates: SelectionCandidate[] = [
      { osmId: "way/far", isNamedRoute: false, distancePx: 10 },
      { osmId: "way/near", isNamedRoute: false, distancePx: 2 },
    ];
    expect(orderSelectionCandidates(candidates).map((c) => c.osmId)).toEqual(["way/near", "way/far"]);
  });

  it("à distance égale, osmId croissant (déterministe)", () => {
    const candidates: SelectionCandidate[] = [
      { osmId: "way/2", isNamedRoute: false, distancePx: 5 },
      { osmId: "way/10", isNamedRoute: false, distancePx: 5 },
    ];
    // Tri lexicographique de chaînes : 'way/10' < 'way/2'.
    expect(orderSelectionCandidates(candidates).map((c) => c.osmId)).toEqual(["way/10", "way/2"]);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const candidates: SelectionCandidate[] = [
      { osmId: "way/2", isNamedRoute: false, distancePx: 5 },
      { osmId: "way/1", isNamedRoute: false, distancePx: 1 },
    ];
    const original = [...candidates];
    orderSelectionCandidates(candidates);
    expect(candidates).toEqual(original);
  });
});

describe("cycleSelectionCandidate — touches N / P (§5.4.1)", () => {
  const ordered: SelectionCandidate[] = [
    { osmId: "a", isNamedRoute: false, distancePx: 0 },
    { osmId: "b", isNamedRoute: false, distancePx: 1 },
    { osmId: "c", isNamedRoute: false, distancePx: 2 },
  ];

  it("aucun ensemble de candidats ⟹ null", () => {
    expect(cycleSelectionCandidate([], null, 1)).toBeNull();
  });

  it("rien de sélectionné, N ⟹ le premier ; P ⟹ le dernier", () => {
    expect(cycleSelectionCandidate(ordered, null, 1)?.osmId).toBe("a");
    expect(cycleSelectionCandidate(ordered, null, -1)?.osmId).toBe("c");
  });

  it("N avance, P recule, circulairement", () => {
    expect(cycleSelectionCandidate(ordered, "a", 1)?.osmId).toBe("b");
    expect(cycleSelectionCandidate(ordered, "c", 1)?.osmId).toBe("a");
    expect(cycleSelectionCandidate(ordered, "a", -1)?.osmId).toBe("c");
  });

  it("le sélectionné courant n'est plus dans l'ensemble (le viseur a bougé) ⟹ repart du premier/dernier", () => {
    expect(cycleSelectionCandidate(ordered, "z", 1)?.osmId).toBe("a");
    expect(cycleSelectionCandidate(ordered, "z", -1)?.osmId).toBe("c");
  });
});
