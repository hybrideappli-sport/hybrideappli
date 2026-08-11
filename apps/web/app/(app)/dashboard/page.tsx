import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { EntitlementView } from "@hybride/domain";

import { signOutAction } from "@/app/(auth)/actions";
import { DegradedModeBanner } from "@/components/account/degraded-mode-banner";
import { CoachPlanCard } from "@/components/dashboard/coach-plan-card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { FreeAccessMeter } from "@/components/dashboard/free-access-meter";
import { UpsellBanner } from "@/components/dashboard/upsell-banner";
import { macroFocusForToday, WeeklyPreviewCard, WeeklyPreviewLocked } from "@/components/dashboard/weekly-preview-card";
import { WeeklyReviewBadge } from "@/components/dashboard/weekly-review-badge";
import { PaywallGate } from "@/components/paywall/paywall-gate";
import { DailyLogForm } from "@/components/today/daily-log-form";
import { MedicalClearanceNotice } from "@/components/today/medical-clearance-notice";
import { PainReferralNotice } from "@/components/today/pain-referral-notice";
import { Button } from "@/components/ui/button";
import { startOfIsoWeekIso } from "@/lib/dates";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { isHealthConsentActive } from "@/lib/orchestration/health-consent-status";
import { fetchMacroPlan, fetchWeekPlan } from "@/lib/orchestration/read-plan-week-macro";
import {
  fetchActiveMedicalClearanceNotice,
  fetchActivePainNotice,
  fetchTodayNutritionView,
  fetchTodaySessionView,
  getActivePlanVersionId,
} from "@/lib/orchestration/read-today-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * Résout l'entitlement AVANT toute construction de JSX (règle `react-hooks/error-boundaries` :
 * une erreur levée pendant le rendu d'un arbre JSX construit À L'INTÉRIEUR d'un `try/catch` n'est
 * de toute façon jamais interceptée par ce `catch`, React différant le rendu réel). `requireEntitlement()`
 * lève `PaywallRequiredError` intentionnellement (pas une erreur système) : capturée ici, jamais
 * laissée remonter jusqu'au rendu.
 */
async function resolveEntitlement(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  args: { userId: string; now: string },
): Promise<{ blocked: false; entitlement: EntitlementView } | { blocked: true; entitlement: EntitlementView }> {
  try {
    const entitlement = await requireEntitlement(admin, { userId: args.userId, now: args.now, surface: "dashboard" });
    return { blocked: false, entitlement };
  } catch (error) {
    if (error instanceof PaywallRequiredError) return { blocked: true, entitlement: error.entitlement };
    throw error;
  }
}

/**
 * `DashboardPage` — AC1, AC5, AC13. Coach IA (plan du jour) en premier ET mis en avant (bordure
 * accent, `CoachPlanCard`), données/aperçu semaine ensuite, bandeau upsell en bas de page
 * (`04-flow.md`, `06-recap.md` §6). `requireEntitlement()` consomme 1 accès/jour côté SERVEUR,
 * avant tout affichage — le paywall n'est jamais une simple décision d'UI (§3.3).
 */
export default async function DashboardPage() {
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
  const { blocked, entitlement } = await resolveEntitlement(admin, { userId: user.id, now });

  const header = (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="flex items-center gap-2">
        <Link href="/compte" className="text-sm text-neutral-500 underline-offset-4 hover:underline" data-testid="account-link">
          Mon compte
        </Link>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  );

  if (blocked) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
        {header}
        {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
        {medicalClearanceNotice ? <MedicalClearanceNotice notice={medicalClearanceNotice} /> : null}
        {!healthConsentActive ? <DegradedModeBanner /> : null}
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600" data-testid="paywall-blocked">
          <p className="font-medium text-neutral-800">Tu as utilisé tous tes accès libres cette semaine</p>
          <p className="mt-1">
            Reviens le {entitlement.freeAccess.resetsAt} pour un nouvel accès gratuit, ou{" "}
            <Link href="/abonnement" className="font-medium text-orange-500 underline underline-offset-2" data-testid="paywall-upgrade-link">
              passe en illimité
            </Link>{" "}
            pour continuer dès maintenant — ton coach reste disponible 24/7 avec une adaptation continue.
          </p>
        </div>
        <FreeAccessMeter freeAccess={entitlement.freeAccess} />
        {/* AC13/ADR-008 §5 — la saisie quotidienne (`POST /session-logs`, ne consomme jamais
            d'accès libre) reste accessible même quota épuisé : seul le CONTENU (séance/nutrition
            du jour) est derrière ce quota, jamais la capacité à déclarer sa journée. */}
        <DailyLogForm plannedSessionId={null} loggedDate={now} />
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

  // AC13, finding B4 — contenu RÉEL de `WeeklyPreviewCard` (`plan_weeks`/`plan_blocks`, déjà
  // matérialisés), pas un texte annonçant une fonctionnalité qui n'existait pas encore. Chargé
  // uniquement pour les abonnés : un utilisateur `free` voit `WeeklyPreviewLocked`, jamais ce fetch.
  const [weekPlan, macroPlan] = entitlement.canViewWeek && planVersionId
    ? await Promise.all([
        fetchWeekPlan(admin, { userId: user.id, planVersionId, weekStart: startOfIsoWeekIso(now) }),
        fetchMacroPlan(admin, { planVersionId }),
      ])
    : [null, null];
  const macroFocus = macroPlan ? macroFocusForToday(macroPlan, now) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
      {header}

      {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
      {!healthConsentActive ? <DegradedModeBanner /> : null}

      {planVersionId ? <CoachPlanCard session={session} nutrition={nutrition} /> : <DashboardEmptyState />}

      <PaywallGate entitled={entitlement.canViewWeek} fallback={<WeeklyPreviewLocked />}>
        <WeeklyPreviewCard week={weekPlan} macroFocus={macroFocus} />
      </PaywallGate>

      <WeeklyReviewBadge userId={user.id} />
      {entitlement.tier === "free" ? <FreeAccessMeter freeAccess={entitlement.freeAccess} /> : null}
      <UpsellBanner tier={entitlement.tier} />
    </main>
  );
}
