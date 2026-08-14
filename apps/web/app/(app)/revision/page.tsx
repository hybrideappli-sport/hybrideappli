import type { Metadata } from "next";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { PlanDiffView } from "@/components/review/plan-diff-view";
import { PaywallGate } from "@/components/paywall/paywall-gate";
import { getEntitlement } from "@/lib/entitlements";
import { readLatestPlanDiff } from "@/lib/orchestration/read-plan-diff";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Révision hebdomadaire — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `WeeklyReviewPage` (AC5) — lit directement en base (même pattern que `DashboardPage`, Lot L4)
 * plutôt qu'un aller-retour HTTP interne vers `GET /plan/reviews/latest` : cette route existe pour
 * un client externe futur, cette page Server Component n'en a pas besoin (`readLatestPlanDiff()`
 * partagée par les deux).
 */
export default async function WeeklyReviewPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const entitlement = await getEntitlement(admin, { userId: user.id, now });

  const { data: plan } = await admin.from("plans").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const diffView = plan ? await readLatestPlanDiff(admin, plan.id) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
      <h1 className="font-serif text-title text-foreground">Révision hebdomadaire</h1>

      <PaywallGate
        entitled={entitlement.canViewWeek}
        fallback={
          <div className="rounded-lg bg-surface p-6 text-center text-body text-foreground-muted" data-testid="revision-paywall">
            <p>La révision hebdomadaire complète est réservée aux abonnés.</p>
          </div>
        }
      >
        {diffView ? (
          <PlanDiffView diff={diffView} />
        ) : (
          <p className="text-body text-foreground-muted" data-testid="revision-empty">
            Aucune révision hebdomadaire disponible pour le moment — reviens dimanche soir.
          </p>
        )}
      </PaywallGate>
    </main>
  );
}
