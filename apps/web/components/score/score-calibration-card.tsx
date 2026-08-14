import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/score/score-ring";

/**
 * `S-score-card--calibration` — AC8 (`09-design-feature2-notes.md` §4.6). AUCUN chiffre, même
 * grisé : anneau à piste seule, tiret au centre. Barre `role="progressbar"` `weeksAvailable/weeksRequired`.
 */
export function ScoreCalibrationCard({
  weeksAvailable,
  weeksRequired,
  hasAnySource,
}: {
  weeksAvailable: number;
  weeksRequired: number;
  hasAnySource: boolean;
}) {
  const progressPct = weeksRequired > 0 ? Math.min(100, Math.round((100 * weeksAvailable) / weeksRequired)) : 0;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-5 text-center" data-testid="score-calibration-card">
      <ScoreRing score={null} delta={null} />
      <p className="text-label text-warning">CALIBRATION EN COURS</p>
      <h2 className="font-serif text-title text-foreground">Pas encore de score fiable.</h2>
      <p className="text-body text-foreground-muted">
        Il me faut {weeksRequired} semaines de données comparables pour te donner un score qui veut dire quelque chose. Tu en es à{" "}
        {weeksAvailable}.
      </p>
      <div className="flex w-full items-center gap-3">
        <span
          className="h-1 flex-1 rounded-full bg-border-strong"
          role="progressbar"
          aria-valuenow={weeksAvailable}
          aria-valuemin={0}
          aria-valuemax={weeksRequired}
          aria-valuetext={`${weeksAvailable} semaines sur ${weeksRequired}`}
        >
          <span className="block h-1 rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
        </span>
        <span className="text-small text-accent">
          {weeksAvailable} / {weeksRequired} semaines
        </span>
      </div>
      {hasAnySource ? (
        <Button asChild variant="ghost" className="w-full">
          <Link href="/aujourdhui">Voir ma séance du jour</Link>
        </Button>
      ) : (
        <Button asChild className="w-full">
          <Link href="/donnees">Connecter mes sources</Link>
        </Button>
      )}
    </div>
  );
}
