import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { InvoiceView } from "@hybride/domain";

import { getStripeClient } from "../stripe";

/** `GET /api/v1/billing/invoices` et `InvoicesPage` (écran S2, `04-flow.md`) partagent cette lecture. */
export async function listInvoicesForUser(admin: SupabaseClient<Database>, userId: string): Promise<InvoiceView[]> {
  const { data: subscriptionRow, error } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`listInvoicesForUser: subscriptions — ${error.message}`);
  if (!subscriptionRow?.stripe_customer_id) return [];

  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({ customer: subscriptionRow.stripe_customer_id, limit: 24 });

  return invoices.data.map((invoice) => ({
    id: invoice.id ?? "",
    number: invoice.number,
    amountDueCents: invoice.amount_due,
    currency: invoice.currency,
    status: invoice.status ?? "unknown",
    created: new Date(invoice.created * 1000).toISOString(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  }));
}
