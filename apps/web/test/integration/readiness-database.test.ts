import { describe, expect, it } from "vitest";

import { checkDatabase, REQUIRED_CONSENT_DOCUMENTS } from "@/lib/health/readiness";
import { serviceRoleClient } from "./support/test-clients";

/**
 * `checkDatabase()` (`docs/pret-pour-la-prod.md` §2 et §8) sur la base locale.
 *
 * En local, `seed.sql` a tout activé : ruleset actif, documents de consentement courants. Ce test
 * vérifie donc que les contrôles passent quand l'état est bon, PUIS qu'un document non courant, la
 * situation exacte de `hybrideclub` constatée le 2026-09-29, est bien détecté.
 */
const admin = serviceRoleClient();

describe("readiness — état de la base", () => {
  it("la base locale, seedée, passe tous les contrôles", async () => {
    const checks = await checkDatabase(admin);
    expect(checks.filter((check) => check.status !== "ok")).toEqual([]);
    expect(checks.map((check) => check.id)).toEqual([
      "ruleset_actif",
      ...REQUIRED_CONSENT_DOCUMENTS.map((doc) => `consent_documents.${doc.code}`),
      "sports",
    ]);
  });

  it("un document de consentement sans version courante est détecté — l'état de la production", async () => {
    const { data: current, error } = await admin
      .from("consent_documents")
      .select("version")
      .eq("code", "health_data_processing")
      .eq("locale", "fr")
      .eq("is_current", true)
      .single();
    if (error) throw error;

    // Clé du registre : (code, version, locale) — il n'a pas d'identifiant propre.
    const key = { code: "health_data_processing", version: current.version, locale: "fr" };
    await admin.from("consent_documents").update({ is_current: false }).match(key);
    try {
      const checks = await checkDatabase(admin);
      expect(checks.find((check) => check.id === "consent_documents.health_data_processing")).toMatchObject({
        status: "missing",
        severity: "blocking",
      });
    } finally {
      await admin.from("consent_documents").update({ is_current: true }).match(key);
    }
  });
});
