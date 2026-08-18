/**
 * Rendu par template déterministe — le repli d'ADR-002 §3, écrit et maintenu EN PLUS du rendu
 * LLM (coût de duplication assumé, ADR-002 « Conséquences négatives »). Construit uniquement à
 * partir des valeurs déjà présentes dans les `DecisionTrace` : il ne peut donc, par construction,
 * jamais échouer le contrôle d'intégrité numérique (`numeric-integrity.ts`).
 */

import type { ExplanationSubjectType, LlmTraceInput } from "./types";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "n/d";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

function summarizeTrace(trace: LlmTraceInput): string {
  const { output } = trace;
  switch (trace.category) {
    case "progression":
      return `Charge cible ajustée : ${output.field} passe de ${formatValue(output.before)} à ${formatValue(output.after)}.`;
    case "guardrail":
      return `Garde-fou de sécurité appliqué : ${output.field} plafonné à ${formatValue(output.after)}.`;
    case "nutrition":
      return `Nutrition modulée à la séance : ${output.field} fixé à ${formatValue(output.after)}.`;
    case "interference":
      return `Séance repositionnée pour tenir compte d'une autre discipline pratiquée (${output.field} : ${formatValue(output.after)}).`;
    case "pain":
      return `Adaptation liée à un signal de douleur : ${output.field} passe à ${formatValue(output.after)}.`;
    case "feasibility":
      return `Objectif évalué au regard du délai et du niveau déclarés : ${formatValue(output.after)}.`;
    case "stagnation":
      return `Diagnostic de progression : ${formatValue(output.after)}.`;
    case "risk_restriction":
      return `Restriction de sécurité appliquée au profil déclaré : ${output.field} = ${formatValue(output.after)}.`;
    case "calibration":
      return `Phase de calibration en cours : ${formatValue(output.after)} semaine(s) de données disponibles.`;
    case "hybrid_score":
      return `Score hybride recalculé : ${formatValue(output.after)}/100, à partir de ta charge, ta régularité et ta diversité de disciplines.`;
    default:
      return `${output.field} : ${formatValue(output.before)} → ${formatValue(output.after)}.`;
  }
}

export interface TemplateExplanationInput {
  subjectType: ExplanationSubjectType;
  traces: readonly LlmTraceInput[];
}

export interface TemplateExplanationOutput {
  shortText: string;
  longText: string;
}

export function renderTemplateExplanation({ subjectType, traces }: TemplateExplanationInput): TemplateExplanationOutput {
  if (traces.length === 0) {
    throw new Error(`renderTemplateExplanation: au moins une DecisionTrace est requise (subject=${subjectType}).`);
  }

  const [primary] = traces;
  const shortText = summarizeTrace(primary!);
  // Volontairement construit UNIQUEMENT à partir de `ruleId`/`category`/`output` (jamais
  // `conditionExpr`, qui peut contenir des constantes de formule — ex. « * (1 + cap) » — non
  // couvertes par `inputsUsed`/`output` : les inclure romprait la garantie que ce rendu passe
  // TOUJOURS le contrôle d'intégrité numérique par construction). Puces textuelles (« - »), PAS
  // de numérotation « 1. 2. 3. » : un préfixe numérique introduirait lui-même un littéral non
  // couvert par les traces (finding détecté par `numeric-integrity.test.ts`).
  const longText = traces.map((trace) => `- ${summarizeTrace(trace)} (règle ${trace.ruleId}).`).join("\n");

  return { shortText, longText };
}
