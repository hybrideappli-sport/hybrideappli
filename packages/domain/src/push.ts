/**
 * `POST /api/v1/push/subscriptions` (ADR-011 §5, R8) — abonnement Web Push (VAPID). Forme du
 * `PushSubscription` navigateur standard (`endpoint`, `keys.p256dh`, `keys.auth`).
 */
import { z } from "zod";

export const PushSubscriptionInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;

export interface PushSubscriptionResponse {
  id: string;
}
