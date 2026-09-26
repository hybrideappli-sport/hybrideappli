import { z } from "zod";

import {
  BODY_ZONES,
  COMPLETION_STATUSES,
  PAIN_LEVELS,
  missingDesired,
  missingMandatory,
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

export type ClosedQuestionField = "completion" | "pain" | "painZone" | "rpe" | "freshness";

export interface ClosedQuestionGroup {
  field: ClosedQuestionField;
  legend: string;
  options: { value: string | number; label: string }[];
}

export interface ClosedQuestion {
  prompt: string;
  groups: ClosedQuestionGroup[];
  /** `rpe` / `freshness` seulement : jamais bloquants, on peut passer (ADR-019 §6). */
  skippable: boolean;
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
};

const MANDATORY_PROMPTS: Record<"completion" | "pain" | "painZone", string> = {
  completion: "Choisis simplement : tu as pu faire ta séance ?",
  pain: "Et côté corps, une douleur ou une gêne ?",
  painZone: "C'était où ?",
};

/**
 * La question fermée qui correspond à l'état du brouillon, ou `null` s'il n'y a plus rien à
 * demander. Obligatoires d'abord, un par un. Puis `rpe` et `freshness` ENSEMBLE, en une seule
 * question qu'on peut passer : c'est l'unique insistance d'ADR-019 §6.
 */
export function buildClosedQuestion(draft: DebriefDraft): ClosedQuestion | null {
  const mandatory = missingMandatory(draft)[0];
  if (mandatory) return { prompt: MANDATORY_PROMPTS[mandatory], groups: [GROUPS[mandatory]], skippable: false };

  const desired = missingDesired(draft);
  if (desired.length === 0) return null;
  return { prompt: "C'était dur ? Et tu te sens comment ?", groups: desired.map((field) => GROUPS[field]), skippable: true };
}

export const DEBRIEF_CLOSING_REPLY = "Merci, c'est noté.";

/** Un choix par chips : une réponse structurée, OU le refus de répondre à `rpe` / `freshness`. */
export const DebriefChoiceSchema = z.union([
  z
    .object({
      completion: z.enum(COMPLETION_STATUSES).optional(),
      pain: z.enum(PAIN_LEVELS).optional(),
      painZone: z.enum(BODY_ZONES).optional(),
      rpe: z.number().int().min(1).max(10).optional(),
      freshness: z.number().int().min(1).max(5).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, { message: "Au moins une réponse est requise." }),
  z.object({ skip: z.literal(true) }).strict(),
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
  return parts.join(", ");
}

/** Premier message du coach, affiché avant tout échange et persisté à la création du débrief :
 *  le modèle reçoit ainsi la question à laquelle l'utilisateur répond. */
export function debriefOpening(sessionLabel: string | null): string {
  return sessionLabel ? `Alors, ta séance « ${sessionLabel} » : tu as pu la faire ?` : "Alors, ta séance du jour : tu as pu la faire ?";
}
