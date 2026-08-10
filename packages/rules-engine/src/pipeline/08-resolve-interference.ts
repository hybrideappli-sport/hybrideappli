/**
 * Étape 8 — `resolveInterference` (AC10).
 *
 * Résout la POLITIQUE d'espacement (nombre de jours minimum entre une
 * séance intense et une séance de force sollicitant les mêmes groupes
 * musculaires) ; son application concrète à des séances précises a lieu à
 * l'étape 9 (`buildSessions`), qui produit les traces "instance" quand un
 * ajustement réel est appliqué à une séance donnée.
 */

import type { DecisionTrace, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";

/**
 * Valeur de repli documentée : le paramètre `interference.min_hours_between_
 * intense_and_strength_same_groups` du ruleset `0.1.0-dev` réel est encore
 * `null` (non tranché — `08-architecture.md` §12, question ouverte n°1 par
 * héritage d'ADR-007 §"Question ouverte relayée au fondateur"). 48h est la
 * borne basse documentée par `docs/rulesets/0.1.0-dev.md` §3 elle-même
 * ("48 à 72 h de récupération recommandées entre deux séances intenses").
 * Utilisé UNIQUEMENT si le ruleset ne fournit pas de valeur — jamais une
 * valeur en dur qui écraserait un ruleset qui, lui, en fournit une.
 */
const FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH = 48;

export function resolveInterference(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { minDaysBetweenIntenseAndStrengthSameGroups: number; traces: DecisionTrace[] } {
  const configuredHours = ruleset.params.interference.min_hours_between_intense_and_strength_same_groups;
  const hours = configuredHours ?? FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH;
  const minDays = Math.max(1, Math.ceil(hours / 24));

  const trace = traceFactory.make({
    ruleId: RULE_IDS.interferenceSpacing,
    ruleVersion: RULE_VERSION,
    category: "interference",
    isHardGuardrail: false,
    scope: "plan",
    scopeRefId: null,
    scopeRefDate: context.now,
    conditionExpr:
      configuredHours === null
        ? `ruleset value is null ⇒ fallback ${FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH}h (docs/rulesets/0.1.0-dev.md §3)`
        : `min_hours_between_intense_and_strength_same_groups = ${configuredHours}h`,
    inputsUsed: [
      {
        source: "rulesets",
        sourceId: null,
        field: "interference.min_hours_between_intense_and_strength_same_groups",
        value: configuredHours,
        observedOn: null,
      },
    ],
    output: { field: "min_days_between_intense_and_strength", before: null, after: minDays, direction: "neutral" },
    severity: "info",
  });

  return { minDaysBetweenIntenseAndStrengthSameGroups: minDays, traces: [trace] };
}
