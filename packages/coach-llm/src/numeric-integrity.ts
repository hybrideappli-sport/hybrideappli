/**
 * Contrôle d'intégrité numérique — ADR-002 §3, garde-fou anti-hallucination.
 *
 * Avant persistance d'une explication générée par LLM : extraction de tous les littéraux
 * numériques du texte produit, confrontation à l'ensemble des valeurs présentes dans les
 * `DecisionTrace` sources (valeurs d'entrée + valeurs de sortie), À TOLÉRANCE NULLE. Un nombre
 * introduit, absent ou altéré ⟹ rejet.
 *
 * Volontairement scopé à l'ensemble des valeurs (pas à une correspondance positionnelle
 * nombre-par-nombre) : c'est la formulation exacte de l'ADR (« confrontation à l'ENSEMBLE des
 * valeurs »). Un nombre qui apparaît dans le texte doit être RETROUVABLE quelque part dans les
 * traces, sans quoi il ne peut être qu'inventé.
 */

import type { LlmTraceInput } from "./types";

// Les dates ISO (`2026-08-10`) contiennent des groupes de chiffres qui ne sont pas des valeurs
// numériques métier — on les neutralise avant extraction pour ne jamais les confondre avec un
// chiffre de plan (finding attendu : sans ce retrait, "10" dans "2026-08-10" ferait planter le
// contrôle sur un faux positif dès qu'une date est mentionnée dans le texte).
const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;
const NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/g;

function parseNumericLiteral(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

/** Tous les littéraux numériques présents dans un texte libre (virgule ou point décimal). */
export function extractNumericLiterals(text: string): number[] {
  const withoutDates = text.replace(DATE_PATTERN, " ");
  const matches = withoutDates.match(NUMBER_PATTERN) ?? [];
  return matches.map(parseNumericLiteral).filter((value) => Number.isFinite(value));
}

function collectNumericValue(numbers: Set<number>, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    numbers.add(value);
  }
}

/** L'ensemble des valeurs numériques « couvertes » par les traces — entrées ET sorties. */
export function collectGroundedNumbers(traces: readonly LlmTraceInput[]): Set<number> {
  const numbers = new Set<number>();
  for (const trace of traces) {
    for (const input of trace.inputs) {
      collectNumericValue(numbers, input.value);
    }
    collectNumericValue(numbers, trace.output.before);
    collectNumericValue(numbers, trace.output.after);
  }
  return numbers;
}

export interface NumericIntegrityResult {
  ok: boolean;
  /** Vide si `ok`. Les nombres du texte introuvables dans les traces sources. */
  offendingNumbers: number[];
}

export function checkNumericIntegrity(text: string, traces: readonly LlmTraceInput[]): NumericIntegrityResult {
  const grounded = collectGroundedNumbers(traces);
  const found = extractNumericLiterals(text);
  const offendingNumbers = found.filter((value) => !grounded.has(value));
  return { ok: offendingNumbers.length === 0, offendingNumbers };
}
