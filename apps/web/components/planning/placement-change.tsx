/**
 * Motif « ancien → nouveau », repris à l'identique de `MqvfH` (« Ce qui change cette semaine »),
 * `10-design-feature3-notes.md` §1.5/§1.6. Jamais de `line-through` (§5 point 3).
 */
const FRENCH_WEEKDAYS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function shortFrenchDate(iso: string): string {
  const jsDay = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return FRENCH_WEEKDAYS_SHORT[jsDay === 0 ? 6 : jsDay - 1]!;
}

export function PlacementChange({
  originLabel,
  destinationLabel,
  destinationTone = "warning",
}: {
  originLabel: string;
  destinationLabel: string;
  destinationTone?: "warning" | "subtle";
}) {
  return (
    <p className="text-small text-foreground-subtle" data-testid="placement-change">
      {originLabel} <span aria-hidden>→</span> <span className={destinationTone === "warning" ? "text-warning" : "text-foreground-subtle"}>{destinationLabel}</span>
    </p>
  );
}

export function formatOriginLabel(originDate: string, originTime: string | null): string {
  if (originTime === null) return "Jamais placée";
  return `${shortFrenchDate(originDate)} ${originTime}`;
}
