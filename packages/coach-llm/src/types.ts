/**
 * Types transverses de `@hybride/coach-llm`.
 *
 * `LlmTraceInput` est la forme MINIMISÉE d'une `DecisionTrace` (ADR-010 §4) : uniquement ce qui
 * est strictement nécessaire pour mettre une décision en mots. Ni `user_id`, ni `id` de base, ni
 * `scope_ref_id`/`severity`/`ruleset_version` ne transitent jusqu'ici — c'est la couche
 * d'orchestration (`apps/web/lib/orchestration/render-explanations.ts`) qui construit ce type à
 * partir des `DecisionTrace[]` complètes du moteur, jamais ce package lui-même (il ne dépend
 * d'ailleurs jamais de `@hybride/rules-engine`, voir `no-engine-import.test.ts`).
 */

export interface LlmTraceInputField {
  field: string;
  value: unknown;
}

export interface LlmTraceOutput {
  field: string;
  before: unknown;
  after: unknown;
  direction: "increase" | "decrease" | "neutral";
}

export interface LlmTraceInput {
  ruleId: string;
  category: string;
  conditionExpr: string;
  inputs: LlmTraceInputField[];
  output: LlmTraceOutput;
}

/** `explanations.subject_type` — `docs/db-schema.md` §4. */
export type ExplanationSubjectType =
  | "planned_session"
  | "nutrition_day"
  | "plan_diff"
  | "plan_diff_item"
  | "stagnation_diagnosis"
  | "objective_feasibility"
  | "pain_episode"
  | "plan_version";
