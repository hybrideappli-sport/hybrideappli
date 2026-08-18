import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { DegradedModeBanner } from "@/components/account/degraded-mode-banner";
import { DailyLogForm } from "@/components/today/daily-log-form";
import { MedicalClearanceNotice } from "@/components/today/medical-clearance-notice";
import { NutritionTargets } from "@/components/today/nutrition-targets";
import { PainReferralNotice } from "@/components/today/pain-referral-notice";
import { RestDayEmptyState } from "@/components/today/rest-day-empty-state";
import { SessionDetail } from "@/components/today/session-detail";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { isHealthConsentActive } from "@/lib/orchestration/health-consent-status";
import {
  fetchActiveMedicalClearanceNotice,
  fetchActivePainNotice,
  fetchTodayNutritionView,
  fetchTodaySessionView,
  getActivePlanVersionId,
} from "@/lib/orchestration/read-today-plan";
import { fetchSessionLogForCorrection } from "@/lib/orchestration/read-session-log-for-correction";
import { nowPartsInTimezone, todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Séance et repas du jour — Hybride Club" };
export const dynamic = "force-dynamic";

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Renforcement",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

/**
 * `TodayPage` — AC4, AC9, AC11 (`08-architecture.md` §6.3-6.4, `04-flow.md`). État vide « jour de
 * repos » : `session === null` (`RestDayEmptyState`), INDÉPENDAMMENT de la nutrition — un jour sans
 * séance a quand même des cibles nutritionnelles moduléees (`modulation_reason = 'rest'`), voir
 * `buildNutritionDays` (Lot L2) qui construit la nutrition pour toute la fenêtre détaillée J→J+6,
 * séance ou pas.
 *
 * `?log=<id>` — F3, `11-design-notes.md` §3.3 : variante « corriger une séance », cible du lien
 * « Je l'ai faite quand même » (`notdone-notice.tsx`, `session-card.tsx`). Jamais bloquée par le
 * paywall (une correction est une SAISIE, ADR-008 §5, comme la saisie initiale ci-dessous).
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const { log: correctionLogId } = await searchParams;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // `(app)/layout.tsx` redirige déjà — défense en profondeur uniquement.

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const admin = createSupabaseServiceRoleClient();

  const activePainNotice = await fetchActivePainNotice(admin, user.id);
  const medicalClearanceNotice = await fetchActiveMedicalClearanceNotice(admin, user.id);
  const healthConsentActive = await isHealthConsentActive(supabase, user.id);

  if (correctionLogId) {
    const correctionTarget = await fetchSessionLogForCorrection(admin, { userId: user.id, logId: correctionLogId });

    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-title text-foreground">Corriger une séance</h1>
          <Link href="/aujourdhui" aria-label="Fermer" className="flex size-11 items-center justify-center text-foreground-muted hover:text-foreground">
            <X aria-hidden="true" className="size-5" />
          </Link>
        </div>

        {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
        {!healthConsentActive ? <DegradedModeBanner /> : null}

        {correctionTarget ? (
          <>
            <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
              <p className="text-body-strong font-semibold text-foreground">
                {SESSION_TYPE_LABELS[correctionTarget.sessionType ?? ""] ?? correctionTarget.sessionType ?? "Séance"}
              </p>
              <div className="flex gap-4 text-small text-foreground-subtle">
                {correctionTarget.sportCode ? <span>{correctionTarget.sportCode.replace(/_/g, " ")}</span> : null}
                {correctionTarget.durationMin ? <span>{correctionTarget.durationMin} min</span> : null}
              </div>
            </div>
            <DailyLogForm mode="correction" plannedSessionId={null} loggedDate={correctionTarget.loggedDate} logId={correctionTarget.id} />
          </>
        ) : (
          <div className="rounded-lg bg-surface p-6 text-center" data-testid="correction-not-found">
            <p className="text-body text-foreground-muted">Cette séance est introuvable.</p>
            <Link href="/aujourdhui" className="mt-2 inline-block text-body-strong font-semibold text-accent underline-offset-4 hover:underline">
              Retour à ma séance du jour
            </Link>
          </div>
        )}
      </main>
    );
  }

  // AC9, ADR-008 §5 — le référentiel douleur reste visible même paywallé : lu AVANT le contrôle
  // d'entitlement, jamais conditionné à son résultat. `PaywallRequiredError` est résolue ici, hors
  // de tout `try/catch` entourant du JSX (règle `react-hooks/error-boundaries` — voir Dashboard).
  let blocked = false;
  try {
    await requireEntitlement(admin, { userId: user.id, now, surface: "today" });
  } catch (error) {
    if (error instanceof PaywallRequiredError) {
      blocked = true;
    } else {
      throw error;
    }
  }

  if (blocked) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
        <h1 className="font-serif text-title text-foreground">Séance et repas du jour</h1>
        {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
        {medicalClearanceNotice ? <MedicalClearanceNotice notice={medicalClearanceNotice} /> : null}
        {!healthConsentActive ? <DegradedModeBanner /> : null}
        <div className="rounded-lg bg-surface p-6 text-center" data-testid="paywall-blocked">
          <p className="text-body-strong font-semibold text-foreground">Tu as utilisé tous tes accès libres cette semaine</p>
          <p className="mt-1 text-body text-foreground-muted">Le détail de ta séance et de tes repas revient demain (ou passe en illimité) — mais ta saisie du jour reste possible ci-dessous.</p>
        </div>
        {/* AC13/ADR-008 §5 — `POST /session-logs` ne consomme jamais d'accès libre : seul le
            CONTENU (séance/nutrition détaillés) est derrière le quota, jamais la saisie. Le plan du
            jour reste masqué ici : pas de `plannedSessionId` à rattacher, donc `offplan-only` (AC3
            — Discipline/Durée demandées explicitement plutôt qu'un rattachement invisible). */}
        <DailyLogForm mode="offplan-only" plannedSessionId={null} loggedDate={now} />
        <Link href="/dashboard" className="text-body-strong font-semibold text-accent underline-offset-4 hover:underline">
          Retour au Dashboard
        </Link>
      </main>
    );
  }

  const planVersionId = await getActivePlanVersionId(admin, user.id);
  const [session, nutrition] = planVersionId
    ? await Promise.all([
        fetchTodaySessionView(admin, {
          userId: user.id,
          planVersionId,
          date: now,
          now: nowPartsInTimezone(profileRow?.timezone ?? "Europe/Paris"),
          ruleset: await getActiveRuleset(admin),
        }),
        fetchTodayNutritionView(admin, { userId: user.id, planVersionId, date: now }),
      ])
    : [null, null];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-title text-foreground">Séance et repas du jour</h1>
        <Link href="/dashboard" className="text-small text-foreground-muted hover:text-foreground hover:underline">
          Dashboard
        </Link>
      </div>

      {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
      {!healthConsentActive ? <DegradedModeBanner /> : null}

      {session ? <SessionDetail session={session} /> : <RestDayEmptyState />}
      {nutrition ? <NutritionTargets nutrition={nutrition} /> : null}

      {/* AC3, `11-design-notes.md` §2.2-§2.3 — trois configurations distinctes de la boucle de
          saisie : (1) une séance est prévue et pas encore loguée → formulaire « planifié » + lien
          tertiaire hors plan (Cas A) ; (2) rien à rattacher (jour de repos, ou paywall plus haut) →
          bloc hors plan déplié d'emblée, requis (Cas B) ; (3) la séance prévue est déjà loguée →
          message existant CONSERVÉ, complété du même bloc (Cas B) pour permettre une séance
          supplémentaire non prévue le même jour. */}
      {session || nutrition ? (
        session ? (
          session.log ? (
            <>
              <div className="rounded-lg bg-surface-raised p-4 text-body text-foreground-muted" data-testid="already-logged">
                <p>Tu as déjà enregistré ta saisie du jour.</p>
              </div>
              <DailyLogForm mode="offplan-only" plannedSessionId={null} loggedDate={now} />
            </>
          ) : (
            <DailyLogForm mode="planned" plannedSessionId={session.id} loggedDate={now} />
          )
        ) : (
          <DailyLogForm mode="offplan-only" plannedSessionId={null} loggedDate={now} />
        )
      ) : null}
    </main>
  );
}
