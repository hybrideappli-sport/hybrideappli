/**
 * `D-date` et `D-greeting` — les deux lignes qui ouvrent le Dashboard dans la maquette (`jSZB0`)
 * et qui n'existaient pas en code.
 *
 * Toutes deux dérivent du fuseau du profil, jamais de l'horloge serveur (`08-architecture.md`
 * §12, R9 : « jamais de date serveur implicite »).
 */

/** « MERCREDI 18 SEPTEMBRE ». La casse est portée par `.text-label` (`text-transform: uppercase`),
 *  pas par cette fonction : un lecteur d'écran doit entendre « mercredi », pas des capitales. */
export function longDateLabel(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

/**
 * La maquette dit « Bonjour Thomas. ». Aucun prénom n'est capturé nulle part dans le produit —
 * `profiles.display_name` existe depuis la migration 0002 mais aucun code ne l'écrit, et
 * l'onboarding ne demande jamais de prénom. Arbitrage du fondateur (2026-09-18) : on garde le
 * titre display, sans prénom, en le faisant varier avec l'heure plutôt qu'avec l'identité.
 */
export function greetingFor(localTime: string): string {
  const hour = Number.parseInt(localTime.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "Bonjour.";
  return hour >= 18 || hour < 5 ? "Bonsoir." : "Bonjour.";
}
