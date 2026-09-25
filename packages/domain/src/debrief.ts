import { z } from "zod";

import { BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS, SESSION_TYPES } from "./enums";
import { SportCodeSchema } from "./onboarding";

/**
 * Recueil post-séance conversationnel — US-05, Lot L1 (ADR-019).
 *
 * Le BROUILLON accumulé au fil des tours. Ce n'est pas un `session_log` : il n'a valeur de réalisé
 * que lorsque `CreateSessionLogInputSchema` l'a validé (Lot L2). Même rapport que
 * `ProfileDraftPatch` à un profil d'athlète.
 *
 * Tous les champs sont optionnels, parce qu'une conversation les obtient dans un ordre qu'elle ne
 * choisit pas : l'utilisateur peut annoncer sa douleur avant d'avoir dit s'il a fait la séance.
 * La complétude se juge sur le brouillon ACCUMULÉ (`missingMandatory()`), jamais sur un tour isolé.
 */

/**
 * `.strict()` n'est pas décoratif. Une clé inconnue signifie que le modèle a inventé un champ, et
 * le patch entier est alors rejeté — le tour est requalifié en reformulation plutôt que de laisser
 * entrer une donnée non contractuelle dans le brouillon.
 *
 * Les énumérations sont fermées pour la même raison qui a valu l'incident `course_a_pied` du
 * 2026-09-18 : sans liste fermée, un modèle produit `genou_droit` là où le contrat attend `knee`,
 * et le protocole douleur ne se déclenche jamais. Le prompt énumère, le schéma vérifie.
 */
export const DebriefDraftPatchSchema = z
  .object({
    completion: z.enum(COMPLETION_STATUSES).optional(),
    pain: z.enum(PAIN_LEVELS).optional(),
    painZone: z.enum(BODY_ZONES).optional(),
    painAtRest: z.boolean().optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    freshness: z.number().int().min(1).max(5).optional(),
    actualDurationMin: z.number().int().min(0).max(1440).optional(),
    sportCode: SportCodeSchema.optional(),
    sessionType: z.enum(SESSION_TYPES).optional(),
    comment: z.string().max(1000).optional(),
    notDoneReason: z.string().max(500).optional(),
  })
  .strict();

export type DebriefDraftPatch = z.infer<typeof DebriefDraftPatchSchema>;
export type DebriefDraft = DebriefDraftPatch;

/** Ce que le coach doit obtenir avant toute écriture — ADR-019 §3, écriture précoce. */
export type DebriefMandatoryField = "completion" | "pain" | "painZone";

/**
 * Champs obligatoires encore manquants, dans l'ordre où le coach doit les demander.
 *
 * `painZone` n'est obligatoire que si `pain` a été obtenu ET vaut autre chose que `none` — même
 * règle conditionnelle que le `superRefine` de `CreateSessionLogInputSchema`, et que la contrainte
 * SQL `pain_zone_required`. Tant que `pain` est inconnu, la zone n'est pas encore réclamable.
 *
 * Un tableau vide signifie que le Lot L2 peut écrire.
 */
export function missingMandatory(draft: DebriefDraft): DebriefMandatoryField[] {
  const missing: DebriefMandatoryField[] = [];
  if (draft.completion === undefined) missing.push("completion");
  if (draft.pain === undefined) missing.push("pain");
  else if (draft.pain !== "none" && draft.painZone === undefined) missing.push("painZone");
  return missing;
}

/**
 * Signaux RECHERCHÉS, sans lesquels le log est valide mais INERTE : `rpe` et `freshness` sont,
 * avec la douleur, les trois seuls déclencheurs de la baisse de 20 % de charge
 * (`06-compute-weekly-load-target.ts`). Une conversation qui les laisse vides produit une ligne
 * qui n'ajustera jamais rien — c'est le risque principal du chantier (ADR-019 §Contexte).
 *
 * Ils ne bloquent JAMAIS la clôture : une seule relance, puis on ferme (ADR-019 §6).
 */
export function missingDesired(draft: DebriefDraft): ("rpe" | "freshness")[] {
  const missing: ("rpe" | "freshness")[] = [];
  if (draft.rpe === undefined) missing.push("rpe");
  if (draft.freshness === undefined) missing.push("freshness");
  return missing;
}

/**
 * Champs requis EN PLUS pour une séance hors plan (`plannedSessionId === null`) qui n'est pas un
 * repos manqué : sans séance planifiée pour les fournir, `sportCode` et `actualDurationMin` sont
 * les seules sources possibles de la charge réalisée (ADR-015 §1). Une séance hors plan sans
 * discipline resterait invisible du score hybride.
 */
export function missingOffPlan(draft: DebriefDraft): ("sportCode" | "actualDurationMin")[] {
  if (draft.completion === "not_done") return [];
  const missing: ("sportCode" | "actualDurationMin")[] = [];
  if (draft.sportCode === undefined) missing.push("sportCode");
  if (draft.actualDurationMin === undefined) missing.push("actualDurationMin");
  return missing;
}

/** Fusion d'un patch validé dans le brouillon. Un patch ne retire jamais une valeur déjà obtenue. */
export function mergeDebriefDraft(draft: DebriefDraft, patch: DebriefDraftPatch): DebriefDraft {
  return { ...draft, ...patch };
}
