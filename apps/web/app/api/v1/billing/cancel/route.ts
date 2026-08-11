import { z } from "zod";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const CancelInputSchema = z.object({ atPeriodEnd: z.literal(true) });

/**
 * `POST /api/v1/billing/cancel` — `08-architecture.md` §6.6. Résiliation en fin de période
 * uniquement (`cancel_at_period_end: true`) : jamais de résiliation immédiate depuis cette route,
 * cohérent avec un produit par abonnement (l'utilisateur garde l'accès jusqu'à la fin de la
 * période déjà payée). Le reflet en base (`subscriptions.cancel_at_period_end`) est écrit par le
 * webhook (`customer.subscription.updated`), pas ici — même discipline « les webhooks sont la
 * seule source de vérité » qu'ADR-009 §2 pour l'activation.
 */
export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = CancelInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Corps de requête invalide — seul { atPeriodEnd: true } est accepté.");

  const admin = createSupabaseServiceRoleClient();
  const { data: subscriptionRow, error } = await admin.from("subscriptions").select("stripe_subscription_id").eq("user_id", user.id).maybeSingle();
  if (error) return apiError(500, "INTERNAL_ERROR", error.message);
  if (!subscriptionRow?.stripe_subscription_id) return apiError(404, "NOT_FOUND", "Aucun abonnement actif à résilier.");

  const stripe = getStripeClient();
  const updated = await stripe.subscriptions.update(subscriptionRow.stripe_subscription_id, { cancel_at_period_end: true });

  // `current_period_end` vit désormais sur l'item d'abonnement, pas sur la `Subscription`
  // elle-même (évolution de l'API Stripe constatée sur ce SDK, `stripe@22`) — `items` est inclus
  // par défaut dans la réponse, aucun `expand` nécessaire.
  const currentPeriodEndRaw = updated.items.data[0]?.current_period_end;
  return apiJson({
    status: updated.status,
    currentPeriodEnd: currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000).toISOString() : null,
  });
}
