import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { markNotificationReadAction } from "@/app/(app)/actions";

/**
 * `WeeklyReviewBadge` — AC5 : garantie de repli si la notification push/e-mail n'arrive pas
 * (`08-architecture.md` §7 : « badge persistant dans le Dashboard, seule garantie réellement
 * fiable compte tenu des limites du Web Push sur iOS »). Lot L5 : branché sur `notifications`
 * (`type = 'weekly_review_ready'`, `read_at`) — la ligne la plus récente pilote l'affichage.
 */
export async function WeeklyReviewBadge({ userId }: { userId: string }) {
  const admin = createSupabaseServiceRoleClient();
  const { data: notification } = await admin
    .from("notifications")
    .select("id, body, read_at")
    .eq("user_id", userId)
    .eq("type", "weekly_review_ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!notification || notification.read_at) {
    return (
      <p className="text-caption text-foreground-subtle" data-testid="weekly-review-badge">
        Ta révision hebdomadaire arrive chaque dimanche soir, avec ce qui change et pourquoi.
      </p>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md bg-info/10 px-3 py-2 text-body text-info"
      data-testid="weekly-review-badge-unread"
    >
      <Link href="/revision" className="font-medium underline underline-offset-2" data-testid="weekly-review-badge-link">
        Ta semaine est prête — {notification.body}
      </Link>
      <form action={markNotificationReadAction.bind(null, notification.id)}>
        <button type="submit" className="shrink-0 text-caption text-info hover:text-foreground" aria-label="Marquer comme lue">
          Marquer comme lue
        </button>
      </form>
    </div>
  );
}
