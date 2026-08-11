/**
 * Correspondance zone de douleur (`body_zone`) → groupes musculaires
 * (`muscle_group`) qu'elle recoupe. Heuristique documentée de `developer` :
 * la fiche et les ADR ne fournissent pas cette table, nécessaire pour
 * traduire "zone bloquée" (AC9) en "quelles séances éviter" (étape 9 du
 * pipeline).
 */

import type { BodyZone, MuscleGroup } from "@hybride/domain";

export const PAIN_ZONE_MUSCLE_GROUPS: Record<BodyZone, MuscleGroup[]> = {
  knee: ["quads", "hamstrings"],
  ankle: ["calves"],
  foot: ["calves"],
  hip: ["glutes", "hamstrings"],
  lower_back: ["back", "core"],
  upper_back: ["back"],
  shoulder: ["shoulders"],
  elbow: ["arms"],
  wrist: ["arms"],
  neck: ["shoulders"],
  thigh: ["quads", "hamstrings"],
  calf: ["calves"],
  chest: ["chest"],
  other: [],
};
