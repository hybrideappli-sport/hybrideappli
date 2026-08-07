/**
 * @hybride/domain
 *
 * Point de vérité unique des contrats partagés entre l'application web,
 * le moteur à règles et le service LLM : types, schémas Zod (contrats API,
 * `PlanningContext`, `RulesetParamsSchema`, `PlanDiffItem`, ...).
 *
 * Ce package ne dépend d'aucun autre package du monorepo (voir ADR-003).
 *
 * Contenu réel à construire au Lot L2 du plan d'implémentation
 * (`/plans/US-01-coach-ia-personnalise.md` §6, étape 9). Ce fichier n'est,
 * au Lot L1, qu'un scaffold vide qui matérialise la frontière du package.
 */

export const DOMAIN_PACKAGE_NAME = "@hybride/domain" as const;
