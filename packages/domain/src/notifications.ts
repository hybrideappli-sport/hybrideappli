/**
 * Contrats notifications (Lot L5 — AC5 R8, ADR-011 §5) : badge persistant Dashboard, garantie de
 * repli si le Web Push / e-mail Brevo n'arrive pas.
 */

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsListResponse {
  notifications: NotificationView[];
  unreadCount: number;
}

export interface MarkNotificationReadResponse {
  readAt: string;
}
