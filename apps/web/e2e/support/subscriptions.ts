import { createServiceRoleClient } from "./test-user";

/**
 * Fixture directe `subscriptions.tier = 'premium'` — nécessaire pour `weekly-review.spec.ts` :
 * `GET /plan/reviews/latest`/`WeeklyReviewPage` sont réservés aux abonnés
 * (`08-architecture.md` §6.3, AC13 : la révision hebdomadaire COMPLÈTE n'est jamais en accès
 * libre). `subscribe.spec.ts` teste, lui, le VRAI chemin de déblocage (webhook) — ce raccourci
 * n'est légitime QUE parce que ce n'est pas ce que `weekly-review.spec.ts` cherche à vérifier
 * (AC5, pas AC13).
 */
export async function upgradeToPremiumForUser(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("subscriptions")
    .upsert({ user_id: userId, tier: "premium", status: "active" }, { onConflict: "user_id" });
  if (error) throw new Error(`[e2e] upgradeToPremiumForUser: ${error.message}`);
}
