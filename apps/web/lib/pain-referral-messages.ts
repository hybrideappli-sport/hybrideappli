import type { PainProtocolLevel } from "@hybride/domain";

/**
 * Messages d'orientation professionnel de santé (AC9, niveaux 2 et 3) — texte FIXE, jamais rendu
 * par le LLM ni par le template générique de `@hybride/coach-llm`.
 *
 * Raison : `renderTemplateExplanation()` (`packages/coach-llm/src/template-explanation.ts`)
 * résume TOUTE trace de catégorie `'pain'` par « Adaptation liée à un signal de douleur : … », y
 * compris pour le niveau `'acute'` — formulation trompeuse à cet endroit précis : l'AC9 niveau 3
 * exige explicitement qu'AUCUNE alternative d'auto-adaptation ne soit suggérée, or le mot
 * « adaptation » implique justement une poursuite modifiée de l'effort. Le texte générique reste
 * pertinent pour expliquer la DÉCISION (traçabilité, « en savoir plus », `explanations.short_text`
 * persisté normalement via `renderExplanationForTraces`) ; ce module couvre uniquement le message
 * de la BANNIÈRE D'ALERTE elle-même (`PainReferralNotice`, `CreateSessionLogResponse.painProtocol.referral.message`),
 * qui doit rester exact et non ambigu par construction, indépendamment du fournisseur LLM actif.
 */
export const PAIN_REFERRAL_MESSAGES: Record<Extract<PainProtocolLevel, "persistent" | "acute">, string> = {
  persistent:
    "Cette zone montre des signaux de douleur répétés. Le coach met sa sollicitation en pause et te recommande de consulter un professionnel de santé.",
  acute:
    "Douleur présente à l'effort et au repos : le coach arrête toute sollicitation de cette zone et t'oriente vers un professionnel de santé, sans proposer d'auto-adaptation.",
};
