import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { PlanDiffItemView, PlanDiffView, StoredPlanDiffItem } from "@hybride/domain";

/** `to.weeks.find(detailed)?.isoWeek ?? to.weeks[0]?.isoWeek` — même règle que
 * `diffPlanVersions()` (`packages/rules-engine/src/diff-plan-versions.ts`), relue ici sur un
 * `snapshot` déjà persisté (rien à recalculer). */
function detailedWeekLabel(snapshot: unknown): string | null {
  const weeks = (snapshot as { weeks?: Array<{ isoWeek: string; detailLevel: string }> } | null)?.weeks ?? [];
  return weeks.find((w) => w.detailLevel === "detailed")?.isoWeek ?? weeks[0]?.isoWeek ?? null;
}

/**
 * Lecture partagée entre `GET /api/v1/plan/reviews/latest` et `WeeklyReviewPage` (AC5) — la même
 * projection lue deux fois plutôt que l'un appelant l'autre en HTTP interne (même choix que
 * `read-today-plan.ts`, Lot L4).
 */
export async function readLatestPlanDiff(admin: SupabaseClient<Database>, planId: string): Promise<PlanDiffView | null> {
  const { data: diffRow, error: diffError } = await admin
    .from("plan_diffs")
    .select("id, from_version_id, to_version_id, items, summary_explanation_id, acknowledged_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (diffError) throw new Error(`readLatestPlanDiff: plan_diffs — ${diffError.message}`);
  if (!diffRow) return null;

  const [fromVersionRes, toVersionRes] = await Promise.all([
    diffRow.from_version_id
      ? admin.from("plan_versions").select("snapshot").eq("id", diffRow.from_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("plan_versions").select("snapshot").eq("id", diffRow.to_version_id).maybeSingle(),
  ]);
  if (fromVersionRes.error) throw new Error(`readLatestPlanDiff: plan_versions (from) — ${fromVersionRes.error.message}`);
  if (toVersionRes.error) throw new Error(`readLatestPlanDiff: plan_versions (to) — ${toVersionRes.error.message}`);

  const fromWeek = fromVersionRes.data ? detailedWeekLabel(fromVersionRes.data.snapshot) : null;
  const toWeek = detailedWeekLabel(toVersionRes.data?.snapshot ?? null) ?? "";

  const items = (diffRow.items as unknown as StoredPlanDiffItem[]) ?? [];
  const explanationIds = [...new Set(items.map((i) => i.explanationId).filter((id): id is string => id !== null))];
  const explanationById = new Map<string, string>();
  if (explanationIds.length > 0) {
    const { data: explanationRows, error: explanationsError } = await admin.from("explanations").select("id, short_text").in("id", explanationIds);
    if (explanationsError) throw new Error(`readLatestPlanDiff: explanations (items) — ${explanationsError.message}`);
    for (const row of explanationRows ?? []) explanationById.set(row.id, row.short_text);
  }

  let summary = { short: "", long: "" };
  if (diffRow.summary_explanation_id) {
    const { data: summaryRow, error: summaryError } = await admin
      .from("explanations")
      .select("short_text, long_text")
      .eq("id", diffRow.summary_explanation_id)
      .maybeSingle();
    if (summaryError) throw new Error(`readLatestPlanDiff: explanations (résumé) — ${summaryError.message}`);
    if (summaryRow) summary = { short: summaryRow.short_text, long: summaryRow.long_text ?? "" };
  }

  const itemViews: PlanDiffItemView[] = items.map((item) => ({
    kind: item.kind,
    scope: item.scope,
    targetDate: item.targetDate,
    before: item.before,
    after: item.after,
    direction: item.direction,
    explanation:
      item.explanationId && explanationById.has(item.explanationId)
        ? { short: explanationById.get(item.explanationId)!, explanationId: item.explanationId }
        : null,
  }));

  return { diffId: diffRow.id, fromWeek, toWeek, summary, items: itemViews, acknowledgedAt: diffRow.acknowledged_at };
}
