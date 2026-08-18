import type { DataSourceView } from "@hybride/domain";

import { SourceAction } from "@/components/data/source-action";
import { SourceStatusBadge } from "@/components/data/source-status-badge";

function relativeSyncLabel(lastSyncedAt: string | null): string | null {
  if (!lastSyncedAt) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60_000));
  if (minutes < 1) return "il y a quelques secondes";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `il y a ${hours} h`;
}

/** `C-source-*` — patron commun des 3 cartes de source (`09-design-feature2-notes.md` §3.3). */
export function SourceCard({ source }: { source: DataSourceView }) {
  const syncLabel = relativeSyncLabel(source.lastSyncedAt);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg bg-surface p-5"
      aria-labelledby={`source-${source.code}-title`}
      data-testid={`source-card-${source.code}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`source-${source.code}-title`} className="text-heading font-semibold text-foreground">
          {source.label}
        </h3>
        <SourceStatusBadge status={source.status} />
      </div>
      <p className="text-small text-foreground-muted">{source.description}</p>
      {source.status === "connected" && syncLabel ? (
        <p className="text-small text-foreground-subtle">
          <span aria-hidden="true">↻</span> Dernière synchro · {syncLabel}
        </p>
      ) : null}
      {source.status === "needs_reauth" ? <p className="text-small text-warning">Autorisation expirée ou refusée.</p> : null}
      <SourceAction source={source} />
    </section>
  );
}
