/**
 * Un paramètre de sécurité `null` dans le `Ruleset` reçu ne doit jamais être
 * silencieusement contourné par une valeur inventée par le moteur : on
 * échoue fort et lisiblement (cohérent avec ADR-007 — seul un
 * `ProductionRulesetParamsSchema` valide peut être publié en production ;
 * ici, on protège le moteur lui-même contre un appelant qui lui passerait
 * un ruleset de développement incomplet pour une fonctionnalité qu'il ne
 * couvre pas encore).
 */
export function requireNonNull(value: number | null, path: string): number {
  if (value === null) {
    throw new Error(`Ruleset invalide : "${path}" est null. Ce paramètre doit être renseigné avant exécution (ADR-007).`);
  }
  return value;
}
