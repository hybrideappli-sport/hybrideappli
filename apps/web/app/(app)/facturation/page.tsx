import type { Metadata } from "next";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { listInvoicesForUser } from "@/lib/billing/list-invoices";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Facturation — Hybride Club" };
export const dynamic = "force-dynamic";

/** `InvoicesPage` — écran S2 (`04-flow.md`), accessible depuis le Dashboard une fois abonné. */
export default async function InvoicesPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseServiceRoleClient();
  const invoices = await listInvoicesForUser(admin, user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold">Facturation</h1>

      {invoices.length === 0 ? (
        <p className="text-sm text-neutral-500" data-testid="invoices-empty">
          Aucune facture pour le moment.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="invoices-list">
          {invoices.map((invoice) => {
            const formattedAmount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: invoice.currency.toUpperCase() }).format(
              invoice.amountDueCents / 100,
            );
            return (
              <li key={invoice.id} className="flex items-center justify-between rounded-md border border-neutral-200 p-3 text-sm" data-testid="invoice-row">
                <div>
                  <p className="font-medium text-neutral-800">{new Date(invoice.created).toLocaleDateString("fr-FR")}</p>
                  <p className="text-neutral-500">
                    {formattedAmount} — {invoice.status}
                  </p>
                </div>
                {invoice.hostedInvoiceUrl ? (
                  <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-orange-500 underline">
                    Voir la facture
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
