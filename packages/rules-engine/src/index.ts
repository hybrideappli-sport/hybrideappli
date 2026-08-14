/**
 * @hybride/rules-engine
 *
 * Moteur à règles du coach IA — autorité UNIQUE sur les chiffres du plan
 * (volume, charge, intensité, kcal, macros). Voir ADR-002.
 *
 * Contraintes non négociables :
 * - fonction pure, ZÉRO I/O (pas de `fetch`, pas d'accès base, pas
 *   d'horloge système, pas de `Math.random` non injecté) ;
 * - déterministe et rejouable : même `PlanningContext` + même `Ruleset`
 *   ⟹ sortie strictement identique ;
 * - dépend uniquement de `@hybride/domain` — aucune dépendance réseau ou
 *   base ne doit jamais apparaître dans le `package.json` de ce package.
 *
 * API publique alignée sur `08-architecture.md` §4.1.
 */

export const RULES_ENGINE_PACKAGE_NAME = "@hybride/rules-engine" as const;

export { generatePlan } from "./generate-plan";
export { evaluateObjectiveFeasibility } from "./objective-feasibility";
export { evaluateStagnation } from "./stagnation";
export { evaluatePainProtocol } from "./pain-protocol";
export { diffPlanVersions } from "./diff-plan-versions";
export { evaluateFreeAccess } from "./free-access";
export { computeHybridScore } from "./hybrid-score/compute-hybrid-score";

export { createTraceFactory } from "./lib/trace";
export type { TraceFactory } from "./lib/trace";
export { computeLoadUnits } from "./lib/load-units";
