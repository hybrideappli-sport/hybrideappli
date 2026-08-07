/**
 * @hybride/rules-engine
 *
 * Moteur à règles du coach IA — autorité UNIQUE sur les chiffres du plan
 * (volume, charge, intensité, kcal, macros). Voir ADR-002.
 *
 * Contraintes non négociables (vérifiées en CI au Lot L2) :
 * - fonction pure, ZÉRO I/O (pas de `fetch`, pas d'accès base, pas
 *   d'horloge système, pas de `Math.random` non injecté) ;
 * - déterministe et rejouable : même `PlanningContext` + même `Ruleset`
 *   ⟹ sortie strictement identique ;
 * - dépend uniquement de `@hybride/domain` — aucune dépendance réseau ou
 *   base ne doit jamais apparaître dans le `package.json` de ce package.
 *
 * Contenu réel (pipeline en 12 étapes, `08-architecture.md` §4.2) à
 * construire au Lot L2 du plan d'implémentation
 * (`/plans/US-01-coach-ia-personnalise.md` §6, étapes 9-14). Ce fichier
 * n'est, au Lot L1, qu'un scaffold vide qui matérialise la frontière du
 * package et son isolation physique (ADR-003).
 */

export const RULES_ENGINE_PACKAGE_NAME = "@hybride/rules-engine" as const;
