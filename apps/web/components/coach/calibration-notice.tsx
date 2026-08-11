/**
 * `CalibrationNotice` — AC7 : « je ne peux pas encore conclure » plutôt qu'une fausse assurance.
 * Sortie NOMINALE (pas une erreur) du moteur — voir `GET /api/v1/progress/diagnosis`.
 */
export function CalibrationNotice({ weeksAvailable, weeksRequired, message }: { weeksAvailable: number; weeksRequired: number; message: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600" role="status" data-testid="calibration-notice">
      <p>{message}</p>
      <p className="mt-1 text-xs text-neutral-400">
        {weeksAvailable}/{weeksRequired} semaines de données comparables.
      </p>
    </div>
  );
}
