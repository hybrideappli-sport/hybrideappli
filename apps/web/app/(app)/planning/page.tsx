import type { Metadata } from "next";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { PlanningDayGroup } from "@/components/planning/day-group";
import { PlanningEmptyState } from "@/components/planning/empty-state";
import { startOfIsoWeekIso } from "@/lib/dates";
import { getEntitlement } from "@/lib/entitlements";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { fetchWeekPlan } from "@/lib/orchestration/read-plan-week-macro";
import { getActivePlanVersionId } from "@/lib/orchestration/read-today-plan";
import { nowPartsInTimezone, todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Planning · Semaine — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `PlanningPage` — écran « Planning semaine » (AC5, AC6, `10-design-feature3-notes.md` §1). Écran
 * PREMIUM (hérité d'AC13 F1, aucune règle de paywall redéfinie) : `getEntitlement()` (lecture
 * seule, ne consomme jamais d'accès libre — même patron que `/revision`, `GET /plan/week`) avant
 * toute construction du contenu détaillé. Aucune route de lecture nouvelle : `fetchWeekPlan()` est
 * la MÊME lecture que le Dashboard (AC5 — « même semaine, mêmes placements, pas de double source
 * de vérité »).
 */
export default async function PlanningPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timezone = profileRow?.timezone ?? "Europe/Paris";
  const now = todayInTimezone(timezone);
  const entitlement = await getEntitlement(admin, { userId: user.id, now });

  let content: React.ReactNode;
  if (!entitlement.canViewWeek) {
    content = (
      <div className="rounded-lg bg-surface-raised p-6 text-center" data-testid="planning-paywall">
        <p className="text-body text-foreground-subtle">Vue semaine complète et blocs macro</p>
        <p className="mt-1 font-semibold text-accent-text">Abonnés</p>
      </div>
    );
  } else {
    const planVersionId = await getActivePlanVersionId(admin, user.id);
    const week = planVersionId
      ? await fetchWeekPlan(admin, {
          userId: user.id,
          planVersionId,
          weekStart: startOfIsoWeekIso(now),
          now: nowPartsInTimezone(timezone),
          ruleset: await getActiveRuleset(admin),
        })
      : null;

    const totalSessions = week ? week.days.reduce((sum, day) => sum + day.sessions.length, 0) : 0;

    content =
      week && totalSessions > 0 ? (
        <>
          <p className="text-label text-foreground-subtle">
            SEMAINE DU {formatShortRange(week.weekStart)} · {totalSessions} SÉANCE{totalSessions > 1 ? "S" : ""}
          </p>
          <div className="mt-8 flex flex-col gap-6">
            {week.days.map((day) => (
              <PlanningDayGroup key={day.date} date={day.date} sessions={day.sessions} />
            ))}
          </div>
        </>
      ) : (
        <PlanningEmptyState />
      );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-1 px-5 py-8">
      <p className="text-label text-foreground-muted">PLANNING · SEMAINE</p>
      <h1 className="font-serif text-display text-foreground">Ta semaine.</h1>
      <p className="text-body text-foreground-muted">Placée autour de tes créneaux disponibles.</p>
      <div className="mt-8">{content}</div>
    </main>
  );
}

function formatShortRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${start.getUTCDate()} AU ${end.getUTCDate()} ${months[end.getUTCMonth()]!.toUpperCase()}`;
}
