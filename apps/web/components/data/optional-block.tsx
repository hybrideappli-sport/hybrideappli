/** `C-optional-block` — porte visuellement l'AC9 (`09-design-feature2-notes.md` §3.5). */
export function OptionalBlock() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-raised p-4" data-testid="optional-block">
      <p className="text-label text-accent">POURQUOI C&apos;EST FACULTATIF</p>
      <p className="text-body text-foreground-muted">
        Le coach construit déjà ton plan à partir de ce que tu déclares. Une source connectée affine l&apos;ajustement — elle ne le
        conditionne jamais.
      </p>
    </div>
  );
}
