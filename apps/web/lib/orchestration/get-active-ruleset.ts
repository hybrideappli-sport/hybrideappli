import "server-only";

import { RulesetSchema, type Ruleset } from "@hybride/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * Lit le ruleset actif (ADR-007) — jamais lu par `@hybride/rules-engine` lui-même (ADR-002 §1),
 * uniquement par la couche d'orchestration, qui le passe en argument de `generatePlan()`.
 */
export async function getActiveRuleset(admin: SupabaseClient<Database>): Promise<Ruleset> {
  const { data, error } = await admin.from("rulesets").select("version, params, source_refs").eq("is_active", true).maybeSingle();

  if (error) throw new Error(`getActiveRuleset: ${error.message}`);
  if (!data) {
    throw new Error(
      "getActiveRuleset: aucun ruleset actif — impossible de générer un plan (ADR-007). " +
        "Vérifiez `supabase/seed.sql` (hors production) ou la migration d'activation (production).",
    );
  }

  return RulesetSchema.parse({
    version: data.version,
    params: data.params,
    sourceRefs: (data.source_refs as Record<string, unknown>) ?? undefined,
  });
}
