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
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
      <h1 className="font-serif text-title text-foreground">Facturation</h1>

      {invoices.length === 0 ? (
        <p className="text-body text-foreground-muted" data-testid="invoices-empty">
          Aucune facture pour le moment.
        </p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="invoices-list">
          {invoices.map((invoice) => {
            const formattedAmount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: invoice.currency.toUpperCase() }).format(
              invoice.amountDueCents / 100,
            );
            return (
              <li key={invoice.id} className="flex items-center justify-between rounded-lg bg-surface p-4 text-body" data-testid="invoice-row">
                <div>
                  <p className="font-medium text-foreground">{new Date(invoice.created).toLocaleDateString("fr-FR")}</p>
                  <p className="text-small text-foreground-muted">
                    {formattedAmount} — {invoice.status}
                  </p>
                </div>
                {invoice.hostedInvoiceUrl ? (
                  <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-caption font-medium text-accent underline">
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
