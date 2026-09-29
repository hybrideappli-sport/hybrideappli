import { z } from "zod";

import {
  ADHERENCE_LEVELS,
  BODY_ZONES,
  COMPLETION_STATUSES,
  PAIN_LEVELS,
  missingDesired,
  missingMandatory,
  missingNutrition,
  type AdherenceLevel,
  type BodyZone,
  type CompletionStatus,
  type DebriefDraft,
  type PainLevel,
} from "@hybride/domain";

/**
 * Questions fermées du débrief (US-05, Lot L3, ADR-019 §6).
 *
 * Après deux incompréhensions sur la même question (`MAX_DEBRIEF_REFORMULATIONS`), le coach cesse
 * de reformuler et propose des chips. Une réponse par chip est une valeur STRUCTURÉE : elle ne
 * repasse pas par le LLM, qui vient précisément d'échouer deux fois à comprendre. Elle est validée
 * par le même schéma que les extractions, puis la question suivante est déterministe.
 *
 * Module partagé serveur / client : l'écran rend les chips, la route valide le choix et rédige la
 * réponse du coach à partir des MÊMES libellés.
 */

/** Types de séance en clair — partagés avec `/aujourdhui`, qui les affiche sous le même nom. */
export const SESSION_TYPE_LABELS_FR: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Renforcement",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

export const COMPLETION_LABELS_FR: Record<CompletionStatus, string> = {
  done: "Faite",
  partial: "En partie",
  not_done: "Pas faite",
};

export const PAIN_LABELS_FR: Record<PainLevel, string> = {
  none: "Aucune",
  light: "Une gêne",
  pain: "Une douleur",
};

/** Mêmes libellés que `DailyLogForm` : une même réponse ne change pas de nom d'un écran à l'autre. */
export const ADHERENCE_LABELS_FR: Record<AdherenceLevel, string> = { low: "Faible", partial: "Partielle", high: "Bonne" };

export const BODY_ZONE_LABELS_FR: Record<BodyZone, string> = {
  knee: "Genou",
  ankle: "Cheville",
  foot: "Pied",
  hip: "Hanche",
  lower_back: "Bas du dos",
  upper_back: "Haut du dos",
  shoulder: "Épaule",
  elbow: "Coude",
  wrist: "Poignet",
  neck: "Nuque",
  thigh: "Cuisse",
  calf: "Mollet",
  chest: "Poitrine",
  other: "Ailleurs",
};

export type ClosedQuestionField = "completion" | "pain" | "painZone" | "rpe" | "freshness" | "adherence" | "energy";

/** Les obligatoires, un par un ; puis deux questions groupées, chacune posée une seule fois. */
export type ClosedQuestionId = "completion" | "pain" | "painZone" | "effort" | "nutrition";

export interface ClosedQuestionGroup {
  field: ClosedQuestionField;
  legend: string;
  options: { value: string | number; label: string }[];
}

export interface ClosedQuestion {
  id: ClosedQuestionId;
  prompt: string;
  groups: ClosedQuestionGroup[];
  /** `effort` et `nutrition` seulement : jamais bloquants, on peut passer (ADR-019 §6). */
  skippable: boolean;
  /** `nutrition` : les deux ou rien, `adherence` et `energy` étant `not null` en base. */
  requireAll: boolean;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const GROUPS: Record<ClosedQuestionField, ClosedQuestionGroup> = {
  completion: {
    field: "completion",
    legend: "Ta séance",
    options: COMPLETION_STATUSES.map((value) => ({ value, label: COMPLETION_LABELS_FR[value] })),
  },
  pain: {
    field: "pain",
    legend: "Douleur ou gêne",
    options: PAIN_LEVELS.map((value) => ({ value, label: PAIN_LABELS_FR[value] })),
  },
  painZone: {
    field: "painZone",
    legend: "Où ça ?",
    options: BODY_ZONES.map((value) => ({ value, label: BODY_ZONE_LABELS_FR[value] })),
  },
  rpe: { field: "rpe", legend: "Effort, de 1 à 10", options: range(1, 10).map((value) => ({ value, label: String(value) })) },
  freshness: { field: "freshness", legend: "Forme, de 1 à 5", options: range(1, 5).map((value) => ({ value, label: String(value) })) },
  adherence: {
    field: "adherence",
    legend: "Alimentation aujourd'hui",
    options: ADHERENCE_LEVELS.map((value) => ({ value, label: ADHERENCE_LABELS_FR[value] })),
  },
  energy: { field: "energy", legend: "Énergie, de 1 à 5", options: range(1, 5).map((value) => ({ value, label: String(value) })) },
};

const MANDATORY_PROMPTS: Record<"completion" | "pain" | "painZone", string> = {
  completion: "Choisis simplement : tu as pu faire ta séance ?",
  pain: "Et côté corps, une douleur ou une gêne ?",
  painZone: "C'était où ?",
};

/**
 * La question fermée qui correspond à l'état du brouillon, ou `null` s'il n'y a plus rien à
 * demander. Obligatoires d'abord, un par un. Puis `rpe` et `freshness` ENSEMBLE, puis, si la journée
 * n'a pas encore son check-in, `adherence` et `energy` ENSEMBLE : chacune de ces deux questions est
 * posée une seule fois, et on peut la passer (ADR-019 §6, amendement du 2026-09-26).
 *
 * `after` : la question groupée à laquelle on vient de répondre ou qu'on vient de passer. Elle ne
 * revient pas, même si une réponse partielle y laisse un champ vide.
 */
export function buildClosedQuestion(draft: DebriefDraft, opts: { nutritionDue: boolean; after?: "effort" | "nutrition" }): ClosedQuestion | null {
  const mandatory = missingMandatory(draft)[0];
  if (mandatory) return { id: mandatory, prompt: MANDATORY_PROMPTS[mandatory], groups: [GROUPS[mandatory]], skippable: false, requireAll: true };

  const effort = missingDesired(draft);
  if (opts.after === undefined && effort.length > 0) {
    return { id: "effort", prompt: "C'était dur ? Et tu te sens comment ?", groups: effort.map((field) => GROUPS[field]), skippable: true, requireAll: false };
  }

  const nutrition = missingNutrition(draft, opts.nutritionDue);
  if (opts.after !== "nutrition" && nutrition.length > 0) {
    return {
      id: "nutrition",
      prompt: "Et côté alimentation aujourd'hui, et ton énergie ?",
      groups: nutrition.map((field) => GROUPS[field]),
      skippable: true,
      requireAll: true,
    };
  }
  return null;
}

export const DEBRIEF_CLOSING_REPLY = "Merci, c'est noté.";

/** Un choix par chips : une réponse structurée, OU le refus de répondre à une question groupée. */
export const DebriefChoiceSchema = z.union([
  z
    .object({
      completion: z.enum(COMPLETION_STATUSES).optional(),
      pain: z.enum(PAIN_LEVELS).optional(),
      painZone: z.enum(BODY_ZONES).optional(),
      rpe: z.number().int().min(1).max(10).optional(),
      freshness: z.number().int().min(1).max(5).optional(),
      adherence: z.enum(ADHERENCE_LEVELS).optional(),
      energy: z.number().int().min(1).max(5).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, { message: "Au moins une réponse est requise." })
    // Les deux ou rien : `adherence` et `energy` sont `not null` dans `nutrition_checkins`.
    .refine((value) => (value.adherence === undefined) === (value.energy === undefined), {
      message: "L'alimentation et l'énergie se donnent ensemble.",
    }),
  // Passer une question groupée — jamais une obligatoire.
  z.object({ skip: z.enum(["effort", "nutrition"]) }).strict(),
]);
export type DebriefChoice = z.infer<typeof DebriefChoiceSchema>;

/** Le texte persisté comme message de l'utilisateur : ce qu'il a choisi, dit en clair. */
export function describeChoice(choice: DebriefChoice): string {
  if ("skip" in choice) return "Je passe.";
  const parts: string[] = [];
  if (choice.completion) parts.push(COMPLETION_LABELS_FR[choice.completion]);
  if (choice.pain) parts.push(PAIN_LABELS_FR[choice.pain]);
  if (choice.painZone) parts.push(BODY_ZONE_LABELS_FR[choice.painZone]);
  if (choice.rpe !== undefined) parts.push(`Effort ${choice.rpe}/10`);
  if (choice.freshness !== undefined) parts.push(`Forme ${choice.freshness}/5`);
  if (choice.adherence) parts.push(`Alimentation ${ADHERENCE_LABELS_FR[choice.adherence].toLowerCase()}`);
  if (choice.energy !== undefined) parts.push(`Énergie ${choice.energy}/5`);
  return parts.join(", ");
}

/** Premier message du coach, affiché avant tout échange et persisté à la création du débrief :
 *  le modèle reçoit ainsi la question à laquelle l'utilisateur répond. */
export function debriefOpening(sessionLabel: string | null): string {
  return sessionLabel ? `Alors, ta séance « ${sessionLabel} » : tu as pu la faire ?` : "Alors, ta séance du jour : tu as pu la faire ?";
}
