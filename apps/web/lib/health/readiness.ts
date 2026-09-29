import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";

/**
 * « Prêt pour la prod » vérifié par la machine (`docs/pret-pour-la-prod.md` §8).
 *
 * Trois écarts entre le local et la production ont été découverts un par un, chacun par une panne :
 * clé Mistral absente, documents de consentement jamais publiés, Preview branchées sur la base de
 * production. `seed.sql` et `.env.local` complètent en silence, en local, ce que la production n'a
 * pas. Ce module dit en UN appel ce qui manque, au lieu d'un premier `500` devant un utilisateur.
 *
 * Il ne renvoie JAMAIS une valeur de variable : seulement sa présence, et pour quelques-unes un
 * défaut de forme nommé (« clé Stripe de test en production »), jamais le contenu.
 */

/**
 * - `blocking` : la fonctionnalité échoue (erreur, 500) ;
 * - `fail_closed` : l'app refuse volontairement de la servir, par sécurité ;
 * - `degraded` : l'app continue sans elle, en le journalisant.
 */
export type Severity = "blocking" | "fail_closed" | "degraded";

export interface EnvRequirement {
  name: string;
  severity: Severity;
  /** Fonctionnalité touchée, en clair. */
  feature: string;
  /** Fonctionnalité volontairement fermée (carte en pause, ADR-018) : signalée, jamais bloquante. */
  paused?: boolean;
  /** Défaut de forme, sans jamais citer la valeur. `null` : la forme est bonne. */
  validate?: (value: string) => string | null;
}

/**
 * Toutes les variables que le code de production lit, avec l'effet de leur absence. Source unique :
 * `apps/web/.env.example` doit en lister exactement les noms, et un test échoue si le code se met à
 * lire une variable absente d'ici (`readiness.test.ts`).
 */
export const ENV_REQUIREMENTS: readonly EnvRequirement[] = [
  // Socle
  { name: "NEXT_PUBLIC_SUPABASE_URL", severity: "blocking", feature: "Base de données" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", severity: "blocking", feature: "Base de données" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", severity: "blocking", feature: "Base de données" },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    severity: "blocking",
    feature: "Liens des e-mails d'authentification, liens Brevo, callback OAuth Strava",
    // Absente, le code se replie en silence sur `http://localhost:3000` : c'est pire qu'une erreur.
    validate: (value) =>
      /localhost|127\.0\.0\.1/.test(value) ? "pointe vers localhost" : value.startsWith("https://") ? null : "n'est pas en https",
  },
  { name: "MISTRAL_API_KEY", severity: "fail_closed", feature: "Coach IA : onboarding, plans, saisies, débrief" },
  { name: "CRON_SECRET", severity: "fail_closed", feature: "Les six crons de vercel.json" },
  // Stripe
  {
    name: "STRIPE_SECRET_KEY",
    severity: "blocking",
    feature: "Abonnement",
    validate: (value) => (value.startsWith("sk_live_") ? null : value.startsWith("sk_test_") ? "clé de test" : "préfixe inattendu"),
  },
  { name: "STRIPE_PRICE_ID_MONTHLY", severity: "blocking", feature: "Abonnement" },
  { name: "STRIPE_WEBHOOK_SECRET", severity: "blocking", feature: "Déblocage du compte après paiement" },
  {
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    severity: "blocking",
    feature: "Formulaire de paiement",
    validate: (value) => (value.startsWith("pk_live_") ? null : value.startsWith("pk_test_") ? "clé de test" : "préfixe inattendu"),
  },
  // Strava — `getStravaConfig()` exige les six ensemble.
  { name: "STRAVA_CLIENT_ID", severity: "fail_closed", feature: "Strava" },
  { name: "STRAVA_CLIENT_SECRET", severity: "fail_closed", feature: "Strava" },
  { name: "STRAVA_WEBHOOK_PATH_SECRET", severity: "fail_closed", feature: "Strava" },
  { name: "STRAVA_VERIFY_TOKEN", severity: "fail_closed", feature: "Strava" },
  { name: "DATA_TOKEN_ENC_KEY", severity: "fail_closed", feature: "Strava (chiffrement des jetons)" },
  { name: "OAUTH_STATE_SECRET", severity: "fail_closed", feature: "Strava (signature OAuth)" },
  { name: "STRAVA_WEBHOOK_SUBSCRIPTION_ID", severity: "fail_closed", feature: "Webhook Strava" },
  // Notifications
  { name: "BREVO_API_KEY", severity: "degraded", feature: "E-mails" },
  { name: "BREVO_SENDER_EMAIL", severity: "degraded", feature: "E-mails" },
  { name: "VAPID_PUBLIC_KEY", severity: "degraded", feature: "Notifications push" },
  { name: "VAPID_PRIVATE_KEY", severity: "degraded", feature: "Notifications push" },
  { name: "VAPID_SUBJECT", severity: "degraded", feature: "Notifications push" },
  // Carte — en pause depuis le 2026-09-10 (ADR-018) : son refus est l'état voulu.
  {
    name: "MAP_TILES_PLAN",
    severity: "fail_closed",
    feature: "Carte",
    paused: true,
    validate: (value) => (value === "commercial" ? null : "n'est pas 'commercial'"),
  },
  { name: "MAP_TILES_STYLE_URL", severity: "blocking", feature: "Carte", paused: true },
  { name: "NEXT_PUBLIC_MAP_TILES_API_KEY", severity: "blocking", feature: "Carte", paused: true },
];

/** Variables lues par le code, mais dont l'absence n'a aucun effet en production (défaut appliqué). */
export const OPTIONAL_ENV = [
  "OVERPASS_CONTACT_EMAIL",
  "MAP_TRAILS_RATE_LIMIT_MAX",
  "MAP_TRAILS_RATE_LIMIT_WINDOW_MS",
  "STRAVA_WEBHOOK_RATE_LIMIT_MAX",
  "STRAVA_WEBHOOK_RATE_LIMIT_WINDOW_MS",
  "STRAVA_WEBHOOK_SUBSCRIBE_RATE_LIMIT_MAX",
] as const;

/** Variables des tests et du développement local, sans usage dans le code de production. */
export const LOCAL_ONLY_ENV = ["DATABASE_URL"] as const;

/** Variables qui ne doivent PAS exister en production : leur présence trahit une configuration copiée
 *  depuis le local. `COACH_LLM_PROVIDER=mock` y est ignorée par construction, mais reste un signal. */
export const FORBIDDEN_IN_PRODUCTION = ["COACH_LLM_PROVIDER"] as const;

/** Documents qui doivent avoir une version COURANTE en production — ce que `seed.sql` active en local. */
export const REQUIRED_CONSENT_DOCUMENTS: readonly { code: string; feature: string }[] = [
  { code: "medical_disclaimer", feature: "Onboarding (avertissement médical)" },
  { code: "health_data_processing", feature: "Consentement santé : onboarding, saisies, /compte" },
  { code: "terms", feature: "Conditions d'utilisation" },
  { code: "privacy", feature: "Politique de confidentialité" },
  { code: "third_party_data_import", feature: "Connexion Strava" },
];

export type CheckStatus = "ok" | "missing" | "misconfigured" | "error";

export interface ReadinessCheck {
  id: string;
  category: "env" | "database";
  status: CheckStatus;
  severity: Severity;
  feature: string;
  paused: boolean;
  /** Jamais une valeur : un défaut nommé, ou un message d'erreur de lecture. */
  detail: string | null;
}

export interface ReadinessReport {
  /** Aucun contrôle `blocking` / `fail_closed` en échec, hors fonctionnalités en pause. */
  ready: boolean;
  checkedAt: string;
  /** Uniquement ce qui ne va pas : la liste complète est la source, pas la réponse. */
  problems: ReadinessCheck[];
  counts: { ok: number; problems: number; blocking: number; degraded: number; paused: number };
}

export function checkEnv(env: Record<string, string | undefined>): ReadinessCheck[] {
  const checks: ReadinessCheck[] = ENV_REQUIREMENTS.map((requirement) => {
    const value = env[requirement.name];
    const base = { id: requirement.name, category: "env" as const, severity: requirement.severity, feature: requirement.feature, paused: requirement.paused ?? false };
    if (!value) return { ...base, status: "missing", detail: null };
    const defect = requirement.validate?.(value) ?? null;
    return { ...base, status: defect ? "misconfigured" : "ok", detail: defect };
  });

  for (const name of FORBIDDEN_IN_PRODUCTION) {
    checks.push({
      id: name,
      category: "env",
      severity: "degraded",
      feature: "Configuration copiée depuis le local",
      paused: false,
      status: env[name] ? "misconfigured" : "ok",
      detail: env[name] ? "ne doit pas être définie en production" : null,
    });
  }
  return checks;
}

export async function checkDatabase(admin: SupabaseClient<Database>): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  // `getActiveRuleset()` est exactement ce que le moteur appelle : il lève s'il n'y a aucun ruleset
  // actif, et, en production, si le ruleset actif n'est pas publiable (ADR-007).
  try {
    const ruleset = await getActiveRuleset(admin);
    checks.push({ id: "ruleset_actif", category: "database", status: "ok", severity: "blocking", feature: "Génération des plans", paused: false, detail: `version ${ruleset.version}` });
  } catch (error) {
    checks.push({
      id: "ruleset_actif",
      category: "database",
      status: "missing",
      severity: "blocking",
      feature: "Génération des plans",
      paused: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const { data: currentDocs, error: docsError } = await admin.from("consent_documents").select("code").eq("is_current", true).eq("locale", "fr");
  for (const { code, feature } of REQUIRED_CONSENT_DOCUMENTS) {
    checks.push({
      id: `consent_documents.${code}`,
      category: "database",
      severity: "blocking",
      feature,
      paused: false,
      ...(docsError
        ? { status: "error" as const, detail: docsError.message }
        : currentDocs?.some((doc) => doc.code === code)
          ? { status: "ok" as const, detail: null }
          : { status: "missing" as const, detail: "aucune version courante (is_current) — seul seed.sql les active, jamais en production" }),
    });
  }

  const { count, error: sportsError } = await admin.from("sports").select("code", { count: "exact", head: true });
  checks.push({
    id: "sports",
    category: "database",
    severity: "blocking",
    feature: "Référentiel des disciplines (migration 0010)",
    paused: false,
    ...(sportsError
      ? { status: "error" as const, detail: sportsError.message }
      : (count ?? 0) > 0
        ? { status: "ok" as const, detail: null }
        : { status: "missing" as const, detail: "table vide — migration 0010 non appliquée ?" }),
  });

  return checks;
}

export function summarize(checks: ReadinessCheck[], checkedAt: string): ReadinessReport {
  const problems = checks.filter((check) => check.status !== "ok");
  const isHard = (check: ReadinessCheck) => check.severity !== "degraded" && !check.paused;
  return {
    ready: !problems.some(isHard),
    checkedAt,
    problems,
    counts: {
      ok: checks.length - problems.length,
      problems: problems.length,
      blocking: problems.filter(isHard).length,
      degraded: problems.filter((check) => check.severity === "degraded" && !check.paused).length,
      paused: problems.filter((check) => check.paused).length,
    },
  };
}

export async function evaluateReadiness(admin: SupabaseClient<Database>, env: Record<string, string | undefined>): Promise<ReadinessReport> {
  return summarize([...checkEnv(env), ...(await checkDatabase(admin))], new Date().toISOString());
}
