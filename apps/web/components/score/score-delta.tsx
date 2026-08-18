/**
 * `ScoreDelta` — signe ET flèche obligatoires (`09-design-feature2-notes.md` §4.2). Baisse en
 * `--color-warning`, JAMAIS `--color-danger` : la charte interdit le rouge/vert « bon-mauvais » sur
 * des signaux physiologiques.
 */
export function ScoreDelta({ delta }: { delta: { value: number; since: string } | null }) {
  if (!delta) return null;
  const positive = delta.value >= 0;
  return (
    <p className={`text-small ${positive ? "text-success" : "text-warning"}`} data-testid="score-delta">
      <span aria-hidden="true">{positive ? "↑" : "↓"}</span> {positive ? "+" : "−"}
      {Math.abs(delta.value)} vs semaine dernière
    </p>
  );
}
