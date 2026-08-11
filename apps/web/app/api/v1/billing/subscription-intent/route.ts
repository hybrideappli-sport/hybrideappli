import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { SubscriptionIntentResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { AlreadySubscribedError, createOrReuseSubscriptionIntent, MissingEmailError } from "@/lib/billing/create-subscription-intent";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/billing/subscription-intent` — AC13, ADR-009 §1 (`createOrReuseSubscriptionIntent()`
 * porte la logique complète, partagée avec `SubscriptionPage`).
 *
 * **L'accès n'est jamais débloqué ici** (ADR-009 §2) : cette route persiste
 * `stripe_customer_id`/`stripe_subscription_id`/`status` (nécessaire pour que le webhook, qui ne
 * reçoit que des identifiants Stripe, retrouve l'utilisateur) mais ne touche jamais `tier` — seul
 * `POST /webhooks/stripe` le fait, à réception d'un événement signé.
 *
 * Point ouvert (voir rapport de fin de lot) : `08-architecture.md` §8 liste cette route parmi
 * celles à protéger par rate limiting. Aucune infrastructure de rate limiting générique n'existe
 * encore dans le monorepo — non implémenté à ce lot, faute d'infra partagée.
 */
export async function POST() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  try {
    const body = await createOrReuseSubscriptionIntent(admin, { userId: user.id, email: user.email });
    return apiJson<SubscriptionIntentResponse>(body);
  } catch (error) {
    if (error instanceof MissingEmailError) return apiError(400, "VALIDATION_FAILED", error.message);
    if (error instanceof AlreadySubscribedError) return apiError(409, "CONFLICT", error.message);
    throw error;
  }
}
