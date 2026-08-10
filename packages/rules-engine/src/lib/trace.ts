/**
 * Fabrique de `DecisionTrace` — garantit l'API `{ value, trace }` imposée par
 * ADR-006 : aucune règle du moteur ne doit pouvoir produire une valeur sans
 * trace associée.
 *
 * `id` est **délibérément déterministe** (compteur incrémental scopé au run
 * courant), jamais un UUID aléatoire (`crypto.randomUUID()`/`Math.random()`) :
 * un identifiant non déterministe casserait `determinism.test.ts` (même
 * `PlanningContext` + même `Ruleset` ⟹ sortie strictement identique, ADR-002).
 * L'identifiant réel de base (`decision_traces.id`, `uuid default
 * gen_random_uuid()`) n'est attribué qu'à l'insertion, hors du moteur pur.
 */

import type { DecisionTrace, RuleOutput } from "@hybride/domain";

export interface TraceFactory {
  /** Construit une trace, en lui assignant l'identifiant local suivant. */
  make(input: Omit<DecisionTrace, "id" | "rulesetVersion">): DecisionTrace;
  /** Sucre pour respecter partout le contrat `{ value, trace }` d'ADR-006. */
  wrap<T>(value: T, input: Omit<DecisionTrace, "id" | "rulesetVersion">): RuleOutput<T>;
}

export function createTraceFactory(rulesetVersion: string): TraceFactory {
  let counter = 0;

  function make(input: Omit<DecisionTrace, "id" | "rulesetVersion">): DecisionTrace {
    counter += 1;
    return {
      id: `trace-${counter}`,
      rulesetVersion,
      ...input,
    };
  }

  return {
    make,
    wrap(value, input) {
      return { value, trace: make(input) };
    },
  };
}
