"use client";

import { useState } from "react";
import Link from "next/link";

import type { NotDoneNoticeView } from "@/lib/planning/read-notdone-notices";

const FRENCH_WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const FRENCH_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function formatFrenchDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const jsDay = date.getUTCDay();
  const weekday = FRENCH_WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1];
  return `${weekday} ${date.getUTCDate()} ${FRENCH_MONTHS[date.getUTCMonth()]}`;
}

const RESOLUTION_BODY: Record<NotDoneNoticeView["resolution"], (date: string) => string> = {
  cancelled_week: (date) => `Tu m'as signalé un imprévu ${date} et je n'ai trouvé aucun créneau de remplacement. Je l'ai comptée comme non réalisée.`,
  rescheduled: (date) => `Tu m'as signalé un imprévu ${date} et je n'ai pas trouvé de créneau de remplacement suivi d'effet. Je l'ai comptée comme non réalisée.`,
};

type NoticeState = "default" | "acknowledged" | "error";

/**
 * `D-notdone-notice` — `11-design-notes.md` §3.1-§3.2. Dit ce que le coach a compté, deux actions
 * symétriques : « Je l'ai faite quand même » (correction, `/aujourdhui?log=<id>`, aucun POST direct)
 * et « C'est exact » (`POST /schedule/incidents/:id/acknowledge`, n'écrit rien dans `session_logs`).
 */
export function NotDoneNotice({ notice, extraCount }: { notice: NotDoneNoticeView; extraCount: number }) {
  const [state, setState] = useState<NoticeState>("default");
  const [loading, setLoading] = useState(false);

  async function acknowledge() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/schedule/incidents/${notice.incidentId}/acknowledge`, { method: "POST" });
      if (!response.ok) throw new Error("acknowledge failed");
      setState("acknowledged");
    } catch {
      setState("error");
    } finally {
      setLoading(false);
    }
  }

  if (state === "acknowledged") {
    return (
      <p className="text-small text-foreground-muted" role="status" aria-live="polite" data-testid="notdone-notice-acknowledged">
        C&apos;est noté.
      </p>
    );
  }

  const dateLabel = formatFrenchDate(notice.loggedDate);
  const title = `${dateLabel}${notice.sessionLabel ? ` · ${notice.sessionLabel}` : ""}`;

  return (
    <section
      aria-labelledby={`notdone-title-${notice.incidentId}`}
      className="flex flex-col gap-3 rounded-lg bg-surface p-5"
      data-testid="notdone-notice"
    >
      <p className="text-label text-warning">SÉANCE NON RÉALISÉE</p>
      <p id={`notdone-title-${notice.incidentId}`} className="text-body-strong font-semibold text-foreground">
        {title}
      </p>
      <p className="text-body text-foreground-muted">{RESOLUTION_BODY[notice.resolution](dateLabel)}</p>
      <div className="flex items-center gap-6">
        <Link
          href={`/aujourdhui?log=${notice.sessionLogId}`}
          className="text-small font-medium text-accent-text hover:text-accent-hover hover:underline"
          aria-label={`Corriger : j'ai fait la séance du ${dateLabel}`}
          data-testid="notdone-notice-fix"
        >
          Je l&apos;ai faite quand même
        </Link>
        <button
          type="button"
          onClick={acknowledge}
          disabled={loading}
          aria-busy={loading}
          aria-label={`Confirmer que la séance du ${dateLabel} n'a pas été réalisée`}
          className="text-small font-medium text-foreground-muted hover:text-foreground disabled:opacity-60"
          data-testid="notdone-notice-confirm"
        >
          C&apos;est exact
        </button>
      </div>
      {state === "error" ? (
        <p className="text-small text-danger" role="alert" data-testid="notdone-notice-error">
          La correction n&apos;a pas pu être enregistrée. Réessayer.
        </p>
      ) : null}
      {extraCount > 0 ? (
        <p className="text-small text-foreground-subtle">
          + {extraCount} autre{extraCount > 1 ? "s" : ""} séance{extraCount > 1 ? "s" : ""} concernée{extraCount > 1 ? "s" : ""} ·{" "}
          <Link href="/planning" className="text-accent-text hover:underline">
            Voir le planning →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
