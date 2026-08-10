import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { DailyLogForm } from "@/components/today/daily-log-form";
import { NutritionTargets } from "@/components/today/nutrition-targets";
import { PainReferralNotice } from "@/components/today/pain-referral-notice";
import { RestDayEmptyState } from "@/components/today/rest-day-empty-state";
import { SessionDetail } from "@/components/today/session-detail";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { fetchActivePainNotice, fetchTodayNutritionView, fetchTodaySessionView, getActivePlanVersionId } from "@/lib/orchestration/read-today-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Séance et repas du jour — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `TodayPage` — AC4, AC9, AC11 (`08-architecture.md` §6.3-6.4, `04-flow.md`). État vide « jour de
 * repos » : `session === null` (`RestDayEmptyState`), INDÉPENDAMMENT de la nutrition — un jour sans
 * séance a quand même des cibles nutritionnelles moduléees (`modulation_reason = 'rest'`), voir
 * `buildNutritionDays` (Lot L2) qui construit la nutrition pour toute la fenêtre détaillée J→J+6,
 * séance ou pas.
 */
export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // `(app)/layout.tsx` redirige déjà — défense en profondeur uniquement.

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const admin = createSupabaseServiceRoleClient();

  const activePainNotice = await fetchActivePainNotice(admin, user.id);

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
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-xl font-semibold">Séance et repas du jour</h1>
        {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600" data-testid="paywall-blocked">
          <p className="font-medium text-neutral-800">Tu as utilisé tous tes accès libres cette semaine</p>
          <p className="mt-1">
            La saisie reste accessible depuis ton Dashboard — reviens-y pour connaître ton prochain accès gratuit ou passer en illimité.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-orange-500 underline-offset-4 hover:underline">
          Retour au Dashboard
        </Link>
      </main>
    );
  }

  const planVersionId = await getActivePlanVersionId(admin, user.id);
  const [session, nutrition] = planVersionId
    ? await Promise.all([
        fetchTodaySessionView(admin, { userId: user.id, planVersionId, date: now }),
        fetchTodayNutritionView(admin, { userId: user.id, planVersionId, date: now }),
      ])
    : [null, null];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Séance et repas du jour</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
          Dashboard
        </Link>
      </div>

      {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}

      {session ? <SessionDetail session={session} /> : <RestDayEmptyState />}
      {nutrition ? <NutritionTargets nutrition={nutrition} /> : null}

      {session || nutrition ? (
        session?.log ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600" data-testid="already-logged">
            <p>Tu as déjà enregistré ta saisie du jour.</p>
          </div>
        ) : (
          <DailyLogForm plannedSessionId={session?.id ?? null} loggedDate={now} />
        )
      ) : null}
    </main>
  );
}
