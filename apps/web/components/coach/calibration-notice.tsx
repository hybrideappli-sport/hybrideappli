/**
 * `CalibrationNotice` — AC7 : « je ne peux pas encore conclure » plutôt qu'une fausse assurance.
 * Sortie NOMINALE (pas une erreur) du moteur — voir `GET /api/v1/progress/diagnosis`.
 */
export function CalibrationNotice({ weeksAvailable, weeksRequired, message }: { weeksAvailable: number; weeksRequired: number; message: string }) {
  return (
    <div className="rounded-md bg-surface-raised p-3 text-body text-foreground-muted" role="status" data-testid="calibration-notice">
      <p>{message}</p>
      <p className="mt-1 text-caption text-foreground-subtle">
        {weeksAvailable}/{weeksRequired} semaines de données comparables.
      </p>
    </div>
  );
}
