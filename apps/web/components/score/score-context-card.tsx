/** `S-context-card` — lecture du coach (`09-design-feature2-notes.md` §4.5). */
export function ScoreContextCard({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-5" data-testid="score-context-card">
      <p className="text-label text-accent">CE QUE ÇA VEUT DIRE</p>
      <div className="rounded-md bg-surface-raised p-4">
        <p className="text-body text-foreground-muted">{text}</p>
      </div>
    </div>
  );
}
