import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { InvoicesResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { listInvoicesForUser } from "@/lib/billing/list-invoices";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/billing/invoices` — écran Facturation (S2, `04-flow.md`). Liste les factures Stripe
 * du customer, aucune duplication en base au-delà de ce qui est nécessaire à l'entitlement
 * (ADR-009 §4).
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();
  const invoices = await listInvoicesForUser(admin, user.id);
  return apiJson<InvoicesResponse>({ invoices }, { headers: { "Cache-Control": "no-store" } });
}
