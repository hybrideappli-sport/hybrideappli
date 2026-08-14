import { describe, expect, it } from "vitest";
import { resolveProvenance } from "./provenance";

describe("resolveProvenance — ADR-015 §3, AC10", () => {
  it("source='connected' + connexion active ⟹ 'synced'", () => {
    expect(resolveProvenance("connected", "active")).toBe("synced");
  });

  it("source='connected' + connexion révoquée ⟹ 'declared' (AC10 — bascule d'affichage après déconnexion)", () => {
    expect(resolveProvenance("connected", "revoked")).toBe("declared");
  });

  it("source='connected' + connexion needs_reauth ⟹ 'declared'", () => {
    expect(resolveProvenance("connected", "needs_reauth")).toBe("declared");
  });

  it("source='connected' + aucune connexion résolue (null) ⟹ 'declared'", () => {
    expect(resolveProvenance("connected", null)).toBe("declared");
  });

  it("source='declared' ⟹ toujours 'declared', quel que soit l'état de connexion", () => {
    expect(resolveProvenance("declared", "active")).toBe("declared");
    expect(resolveProvenance("declared", null)).toBe("declared");
  });
});
