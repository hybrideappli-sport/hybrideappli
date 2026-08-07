/**
 * @hybride/coach-llm
 *
 * Port `LlmProvider` + adaptateurs + rendu template de repli + contrôle
 * d'intégrité numérique (voir ADR-002 §2-3). Trois usages seulement :
 * conversation d'onboarding, reformulation sur réponse incomprise,
 * rédaction des explications à partir de `DecisionTrace[]` déjà calculées.
 *
 * Le LLM n'a JAMAIS autorité sur le contenu chiffré du plan : ce package
 * ne dépend jamais de `@hybride/rules-engine` et ne peut jamais l'invoquer
 * (sens unique de la dépendance, ADR-002 §4).
 *
 * Contenu réel (fournisseur Mistral AI, mock déterministe, contrôle
 * d'intégrité numérique) à construire au Lot L3 du plan d'implémentation
 * (`/plans/US-01-coach-ia-personnalise.md` §6, étape 15). Ce fichier
 * n'est, au Lot L1, qu'un scaffold vide qui matérialise la frontière du
 * package.
 */

export const COACH_LLM_PACKAGE_NAME = "@hybride/coach-llm" as const;
