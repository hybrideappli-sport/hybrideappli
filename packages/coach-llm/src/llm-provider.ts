/**
 * `LlmProvider` — le port unique derrière lequel tout fournisseur LLM s'insère (ADR-002 §2,
 * ADR-010 §4 « fournisseur abstrait derrière un port… en changer est un changement d'adaptateur,
 * pas une refonte »). Trois usages, et trois seulement (ADR-002) :
 *
 * 1. `converseOnboarding` — mener la conversation d'onboarding, proposer une extraction de profil
 *    structurée (jamais persistée telle quelle — voir `onboarding-conversation.ts`).
 * 2. `renderExplanation` — mettre en mots des `DecisionTrace` DÉJÀ calculées (jamais de chiffre
 *    inventé : contrôlé a posteriori par `numeric-integrity.ts`).
 *
 * Aucune méthode de ce port ne peut, même indirectement, invoquer `@hybride/rules-engine` : ce
 * package n'en dépend jamais (sens unique de la dépendance, ADR-002 §4).
 */

import type { ExplanationSubjectType, LlmTraceInput } from "./types.js";

export interface ConversationHistoryEntry {
  role: "coach" | "user";
  content: string;
}

export interface ConversationTurnInput {
  /** `onboarding_step` en cours (typé `string` ici pour ne dépendre d'aucun enum applicatif). */
  step: string;
  history: ConversationHistoryEntry[];
  /** Brouillon de profil déjà validé aux tours précédents — jamais de donnée de santé structurée
   * avant consentement (ADR-010 §3), c'est l'appelant qui garantit cette étanchéité. */
  profileDraft: Record<string, unknown>;
  userMessage: string;
}

export interface ConversationTurnOutput {
  /** Réponse du coach à afficher dans le chat. */
  reply: string;
  /** `true` si le fournisseur signale ne pas avoir compris la réponse (04-flow.md). */
  isReformulation: boolean;
  /** Patch JSON candidat à valider par Zod côté appelant (`ProfileDraftPatchSchema`) — jamais
   * persisté tel quel (ADR-002 §2). `null` si rien n'a pu être extrait de ce tour. */
  extraction: Record<string, unknown> | null;
  /** Le fournisseur estime avoir recueilli assez d'information pour cette étape — l'appelant
   * reste seul maître de la machine à états (`onboarding_sessions.current_step`). */
  suggestNextStep: boolean;
}

export interface ExplanationRequest {
  subjectType: ExplanationSubjectType;
  /** Déjà minimisées — voir l'en-tête de `types.ts`. */
  traces: readonly LlmTraceInput[];
  /** Identifiant de corrélation éphémère, PAS un `user_id` (ADR-010 §4). */
  correlationId: string;
}

export interface ExplanationOutput {
  shortText: string;
  longText: string;
}

export interface LlmProvider {
  /** Nom court du fournisseur — persisté dans `explanations.llm_model` / utilisé en log. */
  readonly name: string;
  converseOnboarding(input: ConversationTurnInput): Promise<ConversationTurnOutput>;
  renderExplanation(input: ExplanationRequest): Promise<ExplanationOutput>;
}
