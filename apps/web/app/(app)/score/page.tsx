import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { DisciplineSplit } from "@/components/score/discipline-split";
import { ScoreCalibrationCard } from "@/components/score/score-calibration-card";
import { ScoreContextCard } from "@/components/score/score-context-card";
import { ScoreDelta } from "@/components/score/score-delta";
import { ScoreRing } from "@/components/score/score-ring";
import { VolumeBars } from "@/components/score/volume-bars";
import { computeAndStoreHybridScore } from "@/lib/score/compute-and-store-hybrid-score";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Score hybride — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `/score` — AC7, AC8, AC9 (`09-design-feature2-notes.md` §4). Sous-écran, `✕` de fermeture, PAS de
 * tab bar. Deux états : nominal et calibration — jamais une erreur pour l'un ou l'autre (AC8, sortie
 * NOMINALE du moteur).
 */
export default async function HybridScorePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const admin = createSupabaseServiceRoleClient();

  const header = (
    <header className="flex h-14 items-center justify-between bg-surface-sunken px-5">
      <p className="text-label text-foreground-muted">SCORE HYBRIDE</p>
      <Link href="/dashboard" aria-label="Fermer" className="flex size-11 items-center justify-center text-foreground-muted hover:text-foreground">
        <span aria-hidden="true">✕</span>
      </Link>
    </header>
  );

  let score;
  try {
    score = await computeAndStoreHybridScore(admin, { userId: user.id, now });
  } catch (error) {
    console.error(`[score-page] calcul indisponible pour user=${user.id} : ${error instanceof Error ? error.message : error}`);
    return (
      <main className="mx-auto flex max-w-md flex-col">
        {header}
        <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
          <ScoreRing score={null} delta={null} />
          <p className="text-label text-danger">SCORE INDISPONIBLE</p>
          <p className="text-body text-foreground-muted">Le calcul du score hybride a échoué. Réessaie dans quelques instants.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col">
      {header}
      <div className="flex flex-col gap-4 px-5 py-8">
        <p className="text-label text-accent">INTELLIGENCE PERFORMANCE</p>
        <h1 className="font-serif text-display text-foreground">Ton Score.</h1>

        {score.status === "calibration" ? (
          <>
            <ScoreCalibrationCard weeksAvailable={score.weeksAvailable} weeksRequired={score.weeksRequired} hasAnySource={score.sessionsCounted > 0} />
            <div className="rounded-lg bg-surface p-5">
              <p className="text-label text-foreground-subtle">VOLUME HEBDO · 7 DERNIERS JOURS</p>
              <p className="mt-2 text-metric font-bold text-foreground">{score.volume.totalLoadUnits} UA</p>
              <div className="mt-4">
                <VolumeBars days={score.volume.days} />
              </div>
            </div>
            {score.split ? (
              <div className="rounded-lg bg-surface p-5">
                <p className="mb-3 text-label text-foreground-subtle">RÉPARTITION · 7 DERNIERS JOURS</p>
                <DisciplineSplit split={score.split} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-5 text-center" data-testid="score-card">
              <ScoreRing score={score.score} delta={score.delta} />
              <ScoreDelta delta={score.delta} />
              <p className="text-body text-foreground-muted">
                Basé sur {score.basis.sessions} séance{score.basis.sessions > 1 ? "s" : ""} · {score.basis.disciplines} discipline
                {score.basis.disciplines > 1 ? "s" : ""} · {score.basis.windowDays} derniers jours.
              </p>
            </div>

            <div className="rounded-lg bg-surface p-5">
              <p className="text-label text-foreground-subtle">VOLUME HEBDO · 7 DERNIERS JOURS</p>
              <p className="mt-2 text-metric font-bold text-foreground">{score.volume.totalLoadUnits} UA</p>
              <div className="mt-4">
                <VolumeBars days={score.volume.days} />
              </div>
            </div>

            <div className="rounded-lg bg-surface p-5">
              <p className="mb-3 text-label text-foreground-subtle">RÉPARTITION · 7 DERNIERS JOURS</p>
              <DisciplineSplit split={score.split} />
            </div>

            {score.explanation ? (
              <ScoreContextCard text={score.explanation.short} />
            ) : (
              <ScoreContextCard text="Ta progression se lit dans la charge soutenue, la régularité et la diversité de tes disciplines." />
            )}
          </>
        )}
      </div>
    </main>
  );
}
