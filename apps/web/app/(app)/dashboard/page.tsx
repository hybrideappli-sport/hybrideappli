import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { EntitlementView } from "@hybride/domain";

import { signOutAction } from "@/app/(auth)/actions";
import { DegradedModeBanner } from "@/components/account/degraded-mode-banner";
import { CoachPlanCard } from "@/components/dashboard/coach-plan-card";
import { ConnectInviteCard } from "@/components/dashboard/connect-invite-card";
import { DataCard } from "@/components/dashboard/data-card";
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
import { NotDoneNotice } from "@/components/planning/notdone-notice";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { fetchGlidingWeekPreview } from "@/lib/orchestration/read-gliding-week";
import { isHealthConsentActive } from "@/lib/orchestration/health-consent-status";
import { fetchMacroPlan } from "@/lib/orchestration/read-plan-week-macro";
import {
  fetchActiveMedicalClearanceNotice,
  fetchActivePainNotice,
  fetchTodayNutritionView,
  fetchTodaySessionView,
  getActivePlanVersionId,
} from "@/lib/orchestration/read-today-plan";
import { nowPartsInTimezone, todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { readNotDoneNotices } from "@/lib/planning/read-notdone-notices";
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
      <h1 className="font-serif text-title text-foreground">Dashboard</h1>
      <div className="flex items-center gap-2">
        <Link href="/compte" className="text-small text-foreground-muted hover:text-foreground hover:underline" data-testid="account-link">
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
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
        {header}
        {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
        {medicalClearanceNotice ? <MedicalClearanceNotice notice={medicalClearanceNotice} /> : null}
        {!healthConsentActive ? <DegradedModeBanner /> : null}
        {/* Quota atteint : le contenu reste visible, seul le CTA bascule vers l'abonnement
            (docs/design-system.md §4.11 — jamais tout l'écran grisé). */}
        <div className="rounded-lg bg-surface p-6 text-center" data-testid="paywall-blocked">
          <p className="text-body-strong font-semibold text-foreground">Tu as utilisé tous tes accès libres cette semaine</p>
          <p className="mt-1 text-body text-foreground-muted">
            Reviens le {entitlement.freeAccess.resetsAt} pour un nouvel accès gratuit, ou{" "}
            <Link href="/abonnement" className="text-body-strong font-semibold text-accent underline underline-offset-2" data-testid="paywall-upgrade-link">
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

  const ruleset = await getActiveRuleset(admin);
  const nowParts = nowPartsInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const planVersionId = await getActivePlanVersionId(admin, user.id);
  const [session, nutrition, notDoneNotices] = planVersionId
    ? await Promise.all([
        fetchTodaySessionView(admin, { userId: user.id, planVersionId, date: now, now: nowParts, ruleset }),
        fetchTodayNutritionView(admin, { userId: user.id, planVersionId, date: now }),
        readNotDoneNotices(admin, user.id),
      ])
    : [null, null, []];

  // AC13, finding B4 — contenu RÉEL de `D-planning-card` (`session_placements`, déjà matérialisés),
  // pas un texte annonçant une fonctionnalité qui n'existait pas encore. Chargé uniquement pour les
  // abonnés : un utilisateur `free` voit `WeeklyPreviewLocked`, jamais ce fetch (AC6).
  const [glidingWeek, macroPlan] = entitlement.canViewWeek && planVersionId
    ? await Promise.all([
        fetchGlidingWeekPreview(admin, { userId: user.id, planVersionId, now: nowParts, ruleset }),
        fetchMacroPlan(admin, { planVersionId }),
      ])
    : [[], null];
  const macroFocus = macroPlan ? macroFocusForToday(macroPlan, now) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
      {header}

      {activePainNotice ? <PainReferralNotice notice={activePainNotice} /> : null}
      {!healthConsentActive ? <DegradedModeBanner /> : null}

      {planVersionId ? <CoachPlanCard session={session} nutrition={nutrition} /> : <DashboardEmptyState />}

      {/* US-03, amendement ADR-017 §8-§9 — `D-notdone-notice` : immédiatement après le plan du jour,
          avant tout le reste (design §3.1). `notDoneNotices` porte la plus récente ; le composant
          dérive lui-même « + N autre(s) ». */}
      {notDoneNotices.length > 0 ? <NotDoneNotice notice={notDoneNotices[0]!} extraCount={notDoneNotices.length - 1} /> : null}

      {/* US-03 — `D-planning-card` : ordre éditorial ARRÊTÉ (`08-architecture.md` §14.4). Le même
          objet que le plan du jour, à une autre échelle : la séance du jour, puis la semaine qui la
          contient. Vient AVANT les deux cartes d'enrichissement F2. */}
      <PaywallGate entitled={entitlement.canViewWeek} fallback={<WeeklyPreviewLocked />}>
        <WeeklyPreviewCard days={glidingWeek} macroFocus={macroFocus} />
      </PaywallGate>

      {/* US-02 — `ConnectInviteCard` se masque elle-même hors régime froid. */}
      <ConnectInviteCard userId={user.id} />
      <DataCard userId={user.id} />

      <WeeklyReviewBadge userId={user.id} />
      {entitlement.tier === "free" ? <FreeAccessMeter freeAccess={entitlement.freeAccess} /> : null}
      <UpsellBanner tier={entitlement.tier} />
    </main>
  );
}
