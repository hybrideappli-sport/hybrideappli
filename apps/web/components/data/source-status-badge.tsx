import type { DataSourceStatus } from "@hybride/domain";

// 4 états — `09-design-feature2-notes.md` §3.3.
const BADGE_CONFIG: Record<DataSourceStatus, { label: string; className: string }> = {
  not_connected: { label: "NON CONNECTÉ", className: "border-border-strong text-foreground-subtle" },
  connected: { label: "CONNECTÉ", className: "border-success text-success" },
  manual: { label: "SAISIE MANUELLE", className: "border-border-strong text-foreground-subtle" },
  needs_reauth: { label: "RECONNEXION REQUISE", className: "border-warning text-warning" },
};

export function SourceStatusBadge({ status }: { status: DataSourceStatus }) {
  const config = BADGE_CONFIG[status];
  return (
    <span className={`text-label rounded-full border px-2.5 py-1 ${config.className}`} data-testid="source-status-badge">
      {config.label}
    </span>
  );
}
