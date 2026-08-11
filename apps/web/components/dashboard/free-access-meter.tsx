import type { FreeAccessView } from "@hybride/domain";

/** `FreeAccessMeter` — AC13 : « il te reste N accès », ton NON punitif (notes UX fiche §6). */
export function FreeAccessMeter({ freeAccess }: { freeAccess: FreeAccessView }) {
  return (
    <p className="text-xs text-neutral-500" data-testid="free-access-meter">
      Il te reste {freeAccess.remaining} accès libre{freeAccess.remaining > 1 ? "s" : ""} cette semaine.
    </p>
  );
}
