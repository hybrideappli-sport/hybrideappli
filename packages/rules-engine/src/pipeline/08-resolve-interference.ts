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
import { RULE_IDS, RULE_VERSION } from "../rule-ids";
import type { TraceFactory } from "../lib/trace";

/**
 * Valeur de repli, utilisée UNIQUEMENT si le ruleset ne fournit pas de valeur — jamais une valeur en
 * dur qui écraserait un ruleset qui, lui, en fournit une. Ce paramètre reste hors du schéma de
 * production (`ProductionRulesetParamsSchema`) : un `null` ne met personne en danger, donc le repli
 * doit continuer d'exister pour les rulesets de développement.
 *
 * **24 h depuis le 2026-09-10**, aligné sur la valeur publiée en `1.0.0` (`docs/rulesets/1.0.0.md`
 * §8). L'ancien repli de 48 h venait d'une lecture prudente de `0.1.0-dev.md` §3 ; la méta-analyse
 * la plus récente ne la soutient pas : l'interférence n'est significative que pour deux séances
 * enchaînées dans la même session (≤ 20 min), et seulement sur la force explosive — dès trois heures
 * de séparation, aucun effet significatif, ni sur la force maximale ni sur l'hypertrophie.
 *
 * Le point qui a fait trancher : la valeur est convertie en jours (`max(1, ceil(h / 24))`), donc 48 h
 * imposait DEUX jours, soit une journée pleine entre les deux séances. Pour un pratiquant à 5-6
 * séances mêlant course et musculation, cela allégeait systématiquement le travail de force — c'est-
 * à-dire la modalité dont la valeur préventive est la mieux établie (−50 % de blessures de surmenage
 * sur 26 essais randomisés, `0.1.0-dev.md` §1-2). Sur-contraindre ici DÉGRADAIT la sécurité.
 *
 * Le volet intra-journée, seul chiffre réellement documenté (3 h), est couvert ailleurs et plus
 * strictement : `planning.min_minutes_between_sessions_same_day = 360`.
 *
 * Repli et valeur publiée sont désormais identiques : développement et production se comportent de
 * la même façon. Les faire diverger à nouveau demanderait une raison explicite.
 */
const FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH = 24;

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
        ? `ruleset value is null ⇒ fallback ${FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH}h (docs/rulesets/1.0.0.md §8)`
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
