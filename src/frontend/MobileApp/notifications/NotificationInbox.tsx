import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import {
  APP_NOTIFICATIONS_CHANGED,
  enablePushNotifications,
  loadAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
  showPushNotification,
  subscribeAppNotifications,
  type AppNotification,
  type AppUserRole,
} from "../../../backend/appNotifications";
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

function kindLabel(item: AppNotification, viewer: AppUserRole) {
  if (viewer === "teacher" && item.senderRole === "teacher") return "Sent to parent";
  if (item.kind === "attendance") return "Attendance";
  if (item.kind === "health") return "Health";
  if (item.kind === "classroom") return "Classroom";
  return "Message";
}

export function useAppNotifications(role: AppUserRole, recipientId: string) {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!recipientId) return;
      const next = await loadAppNotifications(role, recipientId);
      if (active) setItems(next);
    };
    void refresh();
    void enablePushNotifications();
    const onChange = () => { void refresh(); };
    window.addEventListener(APP_NOTIFICATIONS_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    const unsubscribe = subscribeAppNotifications(role, recipientId, item => {
      setItems(current => [item, ...current.filter(row => row.id !== item.id)].slice(0, 40));
      if (document.visibilityState !== "visible") {
        void showPushNotification(item.title, item.body);
      }
    });
    return () => {
      active = false;
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
      unsubscribe();
    };
  }, [role, recipientId]);

  const unread = useMemo(() => items.filter(item => !item.readAt).length, [items]);
  return { items, unread };
}

type BellProps = {
  recipientRole: AppUserRole;
  recipientId: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  icon?: ReactNode;
};

export function NotificationBell({ recipientRole, recipientId, open, onToggle, className, icon }: BellProps) {
  const { items, unread } = useAppNotifications(recipientRole, recipientId);
  const [selected, setSelected] = useState<string | null>(null);

  const openItem = async (item: AppNotification) => {
    setSelected(current => current === item.id ? null : item.id);
    if (!item.readAt) await markAppNotificationRead(item.id);
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
              <button type="button" onClick={() => void markAllAppNotificationsRead(recipientRole, recipientId)}>
                Mark all read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <div className="le-note-empty">
              <Bell />
              <b>No notifications yet</b>
              <small>Teacher messages will appear here.</small>
            </div>
          ) : (
            <div className="le-note-list">
              {items.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={`le-note-item${item.readAt ? "" : " unread"}`}
                  onClick={() => void openItem(item)}
                >
                  <b>{item.title}</b>
                  <small>{kindLabel(item, recipientRole)} · {item.senderName} · {relativeTime(item.createdAt)}</small>
                  {selected === item.id && <p>{item.body}</p>}
                  {selected !== item.id && <p>{item.body.length > 90 ? `${item.body.slice(0, 90)}…` : item.body}</p>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
