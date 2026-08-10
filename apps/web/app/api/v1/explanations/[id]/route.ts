import type { ExplanationDetailView, ExplanationTraceSummary } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/explanations/:id` — AC1, AC5 (« en savoir plus »). Lecture SEULE : jamais de
 * génération à la volée (`08-architecture.md` §6.3) — cette route sert exclusivement ce que
 * `renderExplanations()` a déjà rendu et persisté au moment de la décision. Client RLS (pas
 * `service_role`) : `explanations_select_own` porte déjà l'isolation par utilisateur, inutile de la
 * redupliquer manuellement ici.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: explanation, error } = await supabase
    .from("explanations")
    .select("short_text, long_text, confidence, decision_trace_ids")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return apiError(500, "INTERNAL_ERROR", error.message);
  if (!explanation) return apiError(404, "NOT_FOUND", "Explication introuvable.");

  const { data: traceRows, error: tracesError } = await supabase
    .from("decision_traces")
    .select("rule_id, category, condition_expr, output")
    .in("id", explanation.decision_trace_ids);
  if (tracesError) return apiError(500, "INTERNAL_ERROR", tracesError.message);

  const traces: ExplanationTraceSummary[] = (traceRows ?? []).map((row) => ({
    ruleId: row.rule_id,
    category: row.category,
    conditionExpr: row.condition_expr,
    output: row.output as unknown as ExplanationTraceSummary["output"],
  }));

  const body: ExplanationDetailView = {
    short: explanation.short_text,
    long: explanation.long_text,
    confidence: explanation.confidence,
    traces,
  };
  return apiJson<ExplanationDetailView>(body);
}
