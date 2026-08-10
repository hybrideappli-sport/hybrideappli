/**
 * `DecisionTrace` — l'unité de traçabilité machine (ADR-006 §1). Une ligne =
 * une règle qui s'est déclenchée sur une cible. Produite EXCLUSIVEMENT par
 * `@hybride/rules-engine`, jamais par le LLM.
 *
 * Représente ici la forme **avant** persistance (pas encore d'`id` de base,
 * pas encore de `engine_run_id`/`plan_version_id` — ces identifiants
 * n'existent qu'une fois la transaction d'écriture de l'orchestrateur
 * exécutée, hors périmètre du moteur pur). `id` est un identifiant *local au
 * run*, déterministe (voir `@hybride/rules-engine/lib/trace.ts`) — jamais un
 * UUID aléatoire, ce qui casserait le déterminisme exigé par ADR-002.
 */

import type { DecisionTraceCategory, DecisionTraceScope, TraceDirection, TraceSeverity } from "./enums.js";

export interface TraceInput {
  source: string; // nom de table source, p. ex. 'session_logs'
  sourceId: string | null;
  field: string;
  value: unknown;
  observedOn: string | null; // ISO date
}

export interface TraceOutput {
  field: string;
  before: unknown;
  after: unknown;
  direction: TraceDirection;
}

export interface DecisionTrace {
  /** Identifiant déterministe, local au run — PAS un UUID aléatoire (ADR-002). */
  id: string;
  ruleId: string;
  ruleVersion: string;
  category: DecisionTraceCategory;
  /** AC8 — marque les bornes non contournables, requêtables isolément (ADR-006). */
  isHardGuardrail: boolean;
  scope: DecisionTraceScope;
  scopeRefId: string | null;
  scopeRefDate: string | null; // ISO date
  conditionExpr: string;
  inputsUsed: TraceInput[];
  output: TraceOutput;
  severity: TraceSeverity;
  rulesetVersion: string;
}

/**
 * Contrat imposé à CHAQUE règle du moteur (ADR-006 §"Discipline requise") :
 * une règle ne retourne jamais une valeur seule, toujours accompagnée de sa
 * trace. Rend structurellement impossible d'ajouter une règle sans tracer sa
 * décision.
 */
export interface RuleOutput<T> {
  value: T;
  trace: DecisionTrace;
}

/** Une décision de garde-fou dur, telle que remontée dans `EngineResult.guardrailsApplied`. */
export interface GuardrailHit {
  ruleId: string;
  guardrail:
    | "weekly_volume_progression_cap"
    | "weekly_load_progression_cap"
    | "max_intense_sessions_per_week"
    | "mandatory_deload"
    | "max_consecutive_days_without_rest";
  scope: DecisionTraceScope;
  scopeRefDate: string | null;
  before: unknown;
  after: unknown;
  traceId: string;
}
