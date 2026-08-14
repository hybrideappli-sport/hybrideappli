import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { DataOverviewCell, DataOverviewView } from "@hybride/domain";

import { fetchDataOverview } from "@/lib/data/fetch-data-overview";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

/** `↻` synchronisé · `✎` déclaré · `↻✎` mixte — `09-design-feature2-notes.md` §2.2. `aria-hidden` :
 * le sens est porté par `D-data-legend` et par l'`aria-label` complet de la cellule. */
function provenanceGlyph(provenance: DataOverviewCell["provenance"]): string | null {
  if (provenance === "synced") return "↻";
  if (provenance === "declared") return "✎";
  if (provenance === "mixed") return "↻✎";
  return null;
}

const CELL_TONE_CLASS: Record<DataOverviewCell["tone"], string> = {
  info: "text-info",
  success: "text-success",
  neutral: "text-foreground-muted",
};

function DataMetricCell({ cell }: { cell: DataOverviewCell }) {
  const glyph = provenanceGlyph(cell.provenance);
  const provenanceWord = cell.provenance === "synced" ? "synchronisée" : cell.provenance === "declared" ? "déclarée" : cell.provenance === "mixed" ? "mixte" : null;
  const ariaLabel = `${cell.label} : ${cell.value ?? "aucune donnée"}${cell.trend ? `, ${cell.trend}` : ""}${provenanceWord ? `, donnée ${provenanceWord}.` : "."}`;

  return (
    <div className="flex flex-col" aria-label={ariaLabel} data-testid={`data-cell-${cell.key}`}>
      <span className="text-metric font-bold text-foreground">{cell.value ?? "—"}</span>
      <span className={`text-small ${CELL_TONE_CLASS[cell.tone]}`}>
        {cell.label}
        {cell.trend ? ` · ${cell.trend}` : ""}
        {glyph ? (
          <span aria-hidden="true" className="ml-1 text-foreground-subtle">
            {glyph}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** `D-data-score-row` — dernier enfant de `D-data-card`, accès à `/score` (§2.5). */
function HybridScoreRow({ hybridScore }: { hybridScore: DataOverviewView["hybridScore"] }) {
  const available = hybridScore.status === "available" && hybridScore.score !== null;

  return (
    <Link
      href="/score"
      className="flex min-h-14 items-center gap-3 rounded-md bg-surface-raised px-4 hover:bg-surface-raised/80"
      data-testid="data-score-row"
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
        <circle cx="14" cy="14" r="11" fill="none" stroke="var(--border-strong)" strokeWidth="4" />
        {available ? (
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 14 14)"
            strokeDasharray={`${(69.1 * (hybridScore.score ?? 0)) / 100} 69.1`}
          />
        ) : null}
      </svg>
      <span className="text-body text-foreground">Score hybride</span>
      <span className={`ml-auto text-body-strong font-semibold ${available ? "text-accent" : "text-warning"}`}>
        {available ? hybridScore.score : "Calibration"}
      </span>
      <span aria-hidden="true" className="text-foreground-subtle">
        ›
      </span>
    </Link>
  );
}

/**
 * `DataCard` — « Mes données » (`D-data-card`, AC6, `09-design-feature2-notes.md` §2). Périmètre
 * strict : en-tête, 4 cellules, légende, accès au score. Le bloc de calibration du diagnostic de
 * stagnation (F1) n'est PAS reproduit ici — hors périmètre US-02, non dupliqué depuis
 * `CalibrationNotice`.
 */
export async function DataCard({ userId }: { userId: string }) {
  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const overview = await fetchDataOverview(admin, { userId, now });
  const hasAnyProvenance = overview.cells.some((c) => c.provenance !== null);

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-5" aria-labelledby="data-card-title" data-testid="data-card">
      <div>
        <div className="flex items-center justify-between">
          <p id="data-card-title" className="text-label text-foreground-subtle">
            MES DONNÉES · 7 DERNIERS JOURS
          </p>
          <Link href="/donnees/detail" className="min-h-11 text-body-strong font-semibold text-accent hover:underline" data-testid="data-detail-link">
            Détail →
          </Link>
        </div>
        {overview.sourcesSummary ? <p className="mt-1 text-small text-foreground-muted">{overview.sourcesSummary}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {overview.cells.map((cell) => (
          <DataMetricCell key={cell.key} cell={cell} />
        ))}
      </div>

      {hasAnyProvenance ? (
        <div className="flex gap-4 border-t border-border-subtle pt-4 text-caption text-foreground-muted">
          <span>
            <span aria-hidden="true">↻</span> Synchronisé
          </span>
          <span>
            <span aria-hidden="true">✎</span> Déclaré
          </span>
        </div>
      ) : null}

      {overview.sync?.status === "failed" ? (
        <div role="status" aria-live="polite">
          <p className="text-label text-danger">SYNCHRONISATION EN ÉCHEC</p>
          <Link href="/donnees" className="text-body-strong font-semibold text-accent hover:underline">
            Réessayer
          </Link>
        </div>
      ) : null}

      <HybridScoreRow hybridScore={overview.hybridScore} />
    </section>
  );
}
