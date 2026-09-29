import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkEnv,
  ENV_REQUIREMENTS,
  FORBIDDEN_IN_PRODUCTION,
  LOCAL_ONLY_ENV,
  OPTIONAL_ENV,
  summarize,
} from "./readiness";

/** Un environnement de production complet et bien formé — valeurs factices. */
function completeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const requirement of ENV_REQUIREMENTS) env[requirement.name] = "x";
  env["NEXT_PUBLIC_SITE_URL"] = "https://hybride.club";
  env["STRIPE_SECRET_KEY"] = "sk_live_factice";
  env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] = "pk_live_factice";
  env["MAP_TILES_PLAN"] = "commercial";
  return env;
}

const problemIds = (env: Record<string, string | undefined>) => summarize(checkEnv(env), "t").problems.map((p) => p.id);

describe("readiness — variables d'environnement", () => {
  it("un environnement complet et bien formé est prêt", () => {
    const report = summarize(checkEnv(completeEnv()), "t");
    expect(report.problems).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("reproduit l'état de la production du 2026-09-26 : quatre variables, pas prêt", () => {
    const report = summarize(
      checkEnv({
        NEXT_PUBLIC_SITE_URL: "https://hybride.club",
        SUPABASE_SERVICE_ROLE_KEY: "x",
        NEXT_PUBLIC_SUPABASE_URL: "x",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "x",
      }),
      "t",
    );
    expect(report.ready).toBe(false);
    const ids = report.problems.map((p) => p.id);
    expect(ids).toContain("MISTRAL_API_KEY");
    expect(ids).toContain("CRON_SECRET");
    expect(ids).toContain("STRIPE_SECRET_KEY");
  });

  it("une clé Stripe de test est signalée, sans jamais citer sa valeur", () => {
    const env = { ...completeEnv(), STRIPE_SECRET_KEY: "sk_test_valeur_secrete" };
    const report = summarize(checkEnv(env), "t");
    expect(report.ready).toBe(false);
    const problem = report.problems.find((p) => p.id === "STRIPE_SECRET_KEY");
    expect(problem).toMatchObject({ status: "misconfigured", detail: "clé de test" });
    expect(JSON.stringify(report)).not.toContain("valeur_secrete");
  });

  it("NEXT_PUBLIC_SITE_URL vers localhost est un défaut, pas une valeur acceptable", () => {
    expect(problemIds({ ...completeEnv(), NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("une fonctionnalité dégradée ou en pause est signalée sans bloquer", () => {
    const env = completeEnv();
    delete env["BREVO_API_KEY"];
    delete env["MAP_TILES_PLAN"];
    const report = summarize(checkEnv(env), "t");
    expect(report.ready).toBe(true);
    expect(report.counts).toMatchObject({ degraded: 1, paused: 1, blocking: 0 });
  });

  it("COACH_LLM_PROVIDER en production est signalé comme configuration copiée du local", () => {
    const report = summarize(checkEnv({ ...completeEnv(), COACH_LLM_PROVIDER: "mock" }), "t");
    expect(report.ready).toBe(true);
    expect(report.problems.map((p) => p.id)).toEqual(["COACH_LLM_PROVIDER"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Gardes contre la dérive. La liste de `readiness.ts` ne vaut que si elle reste complète : ces deux
// tests échouent le jour où le code lit une nouvelle variable sans l'y déclarer, ou le jour où
// `.env.example` et la liste divergent.
// ---------------------------------------------------------------------------------------------

const APP_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");

const DECLARED = new Set<string>([
  ...ENV_REQUIREMENTS.map((r) => r.name),
  ...OPTIONAL_ENV,
  ...FORBIDDEN_IN_PRODUCTION,
  ...LOCAL_ONLY_ENV,
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (["node_modules", ".next", "__tests__", "__bench__", "e2e", "test"].includes(entry)) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs|js)$/.test(entry) && !/\.(test|spec)\./.test(entry) ? [full] : [];
  });
}

describe("readiness — la liste des variables ne dérive pas", () => {
  it("le code de production ne lit aucune variable absente de la liste", () => {
    const roots = [
      path.join(APP_ROOT, "app"),
      path.join(APP_ROOT, "lib"),
      path.join(APP_ROOT, "proxy.ts"),
      ...readdirSync(path.join(REPO_ROOT, "packages")).map((pkg) => path.join(REPO_ROOT, "packages", pkg, "src")),
    ];
    const read = new Set<string>();
    for (const root of roots) {
      const files = statSync(root).isDirectory() ? sourceFiles(root) : [root];
      for (const file of files) {
        for (const match of readFileSync(file, "utf8").matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*"([A-Z][A-Z0-9_]*)"\s*\])/g)) {
          read.add(match[1] ?? match[2]!);
        }
      }
    }
    read.delete("NODE_ENV");
    // Garde-fou du test lui-même : s'il ne trouvait rien, il passerait pour de mauvaises raisons.
    expect(read.has("MISTRAL_API_KEY")).toBe(true);

    const undeclared = [...read].filter((name) => !DECLARED.has(name)).sort();
    expect(undeclared).toEqual([]);
  });

  it(".env.example liste exactement les variables déclarées", () => {
    const names = readFileSync(path.join(APP_ROOT, ".env.example"), "utf8")
      .split("\n")
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...DECLARED].sort());
  });
});
