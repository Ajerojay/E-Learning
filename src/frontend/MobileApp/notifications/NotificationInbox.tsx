import { type ReactNode } from "react";
import { Bell, CalendarDays, HeartPulse, Mail, Megaphone, Send, Siren } from "lucide-react";
import {
  markAllAppNotificationsRead,
  type AppNotification,
  type AppUserRole,
} from "../../../backend/appNotifications";
import { useAppNotifications } from "./useAppNotifications";
import "./NotificationInbox.css";

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function kindMeta(item: AppNotification, viewer: AppUserRole) {
  if (viewer === "teacher" && item.senderRole === "teacher") {
    return { label: "Sent", Icon: Send, tone: "sent" };
  }
  if (item.kind === "attendance") return { label: "Attendance", Icon: CalendarDays, tone: "attendance" };
  if (item.kind === "emergency") return { label: "Emergency", Icon: Siren, tone: "emergency" };
  if (item.kind === "health") return { label: "Health", Icon: HeartPulse, tone: "health" };
  if (item.kind === "classroom") return { label: "Classroom", Icon: Megaphone, tone: "classroom" };
  return { label: "Message", Icon: Mail, tone: "message" };
}

function headingFor(item: AppNotification) {
  const title = item.title.trim();
  if (title) return title;
  return kindMeta(item, item.recipientRole).label;
}

type BellProps = {
  recipientRole: AppUserRole;
  recipientId: string;
  open: boolean;
  onToggle: () => void;
  onOpenNotification?: (item: AppNotification) => void;
  className?: string;
  icon?: ReactNode;
};

export function NotificationBell({ recipientRole, recipientId, open, onToggle, onOpenNotification, className, icon }: BellProps) {
  const { items, unread, markRead } = useAppNotifications(recipientRole, recipientId);

  const openItem = async (item: AppNotification) => {
    if (!item.readAt) await markRead(item.id);
    onOpenNotification?.(item);
    onToggle();
  };

  return (
    <div className="le-note-wrap">
      <button type="button" className={`${className || ""} le-note-bell`} aria-label="Open notifications" onClick={onToggle}>
        {icon ?? <Bell />}
        {unread > 0 && <span className="le-note-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <section className="le-note-panel" role="dialog" aria-label="Notifications">
          <header>
            <h3>Notifications</h3>
            {unread > 0 && (
              <button type="button" onClick={() => void markAllAppNotificationsRead(recipientRole, recipientId, items.map(item => item.id))}>
                Mark all read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <div className="le-note-empty">
              <Bell />
              <b>No notifications yet</b>
              <small>{recipientRole === "teacher" ? "Parent allergy cards will appear here." : "Teacher messages will appear here."}</small>
            </div>
          ) : (
            <div className="le-note-list">
              {items.map(item => {
                const meta = kindMeta(item, recipientRole);
                const Icon = meta.Icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`le-note-item${item.readAt ? "" : " unread"}`}
                    onClick={() => void openItem(item)}
                  >
                    <i className={`le-note-kind ${meta.tone}`} aria-hidden="true"><Icon /></i>
                    <span>
                      <b>{headingFor(item)}</b>
                      <small>{meta.label} · {relativeTime(item.createdAt)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
