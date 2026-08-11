import "server-only";

import { ProductionRulesetParamsSchema, RulesetSchema, type Ruleset } from "@hybride/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * Lit le ruleset actif (ADR-007) — jamais lu par `@hybride/rules-engine` lui-même (ADR-002 §1),
 * uniquement par la couche d'orchestration, qui le passe en argument de `generatePlan()`.
 *
 * Correction post-revue (finding B3) : `ProductionRulesetParamsSchema`/`isProductionReady()`
 * étaient écrits et unit-testés (`packages/domain`) mais jamais appelés par du code applicatif —
 * un ruleset avec des garde-fous `null` (`guardrails.*`, `pain_protocol.*`, `nutrition.*`) activé
 * par erreur en production provoquait un `500` opaque au premier `requireNonNull()` du moteur
 * (`generatePlan()`/`evaluatePainProtocol()`), au lieu du refus de démarrage explicite promis par
 * ADR-007 §4 et `08-architecture.md` §9 (« refus de démarrage si un garde-fou est `null` »). En
 * environnement `production`, ce module valide désormais le ruleset lu contre le schéma renforcé
 * AVANT de le renvoyer à l'appelant — le refus se produit ici, avec un message explicite listant
 * les paramètres manquants, jamais plus loin dans le pipeline.
 */
export async function getActiveRuleset(admin: SupabaseClient<Database>): Promise<Ruleset> {
  const { data, error } = await admin.from("rulesets").select("version, params, source_refs").eq("is_active", true).maybeSingle();

  if (error) throw new Error(`getActiveRuleset: ${error.message}`);
  if (!data) {
    throw new Error(
      "getActiveRuleset: aucun ruleset actif — impossible de générer un plan (ADR-007). " +
        "Vérifiez `supabase/seed.sql` (hors production) ou la migration d'activation (production).",
    );
  }

  const ruleset = RulesetSchema.parse({
    version: data.version,
    params: data.params,
    sourceRefs: (data.source_refs as Record<string, unknown>) ?? undefined,
  });

  if (process.env.NODE_ENV === "production") {
    const productionCheck = ProductionRulesetParamsSchema.safeParse(ruleset.params);
    if (!productionCheck.success) {
      const missing = productionCheck.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(
        `getActiveRuleset: le ruleset actif '${ruleset.version}' n'est pas prêt pour la production — ` +
          `paramètre(s) de sécurité manquant(s) (ADR-007 §4) : ${missing}. Refus de démarrage explicite, ` +
          "aucun plan ne sera généré tant que le fondateur n'a pas validé ces valeurs.",
      );
    }
  }

  return ruleset;
}
