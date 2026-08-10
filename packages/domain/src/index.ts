/**
 * @hybride/domain
 *
 * Point de vérité unique des contrats partagés entre l'application web, le
 * moteur à règles et le service LLM : enums, `PlanningContext`, `PlanDraft`,
 * `DecisionTrace`, `RulesetParamsSchema` (Zod), contrats des fonctions du
 * moteur. Voir `08-architecture.md` §2 (arborescence), ADR-003.
 *
 * Ce package ne dépend d'aucun autre package du monorepo.
 */

export const DOMAIN_PACKAGE_NAME = "@hybride/domain" as const;

export * from "./enums.js";
export * from "./ruleset.js";
export * from "./planning-context.js";
export * from "./plan-draft.js";
export * from "./decision-trace.js";
export * from "./engine-contracts.js";
export * from "./onboarding.js";
