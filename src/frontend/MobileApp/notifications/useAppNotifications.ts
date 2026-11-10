import { useEffect, useMemo, useState } from "react";
import {
  APP_NOTIFICATIONS_CHANGED,
  enablePushNotifications,
  loadAppNotifications,
  markAppNotificationRead,
  showPushNotification,
  subscribeAppNotifications,
  type AppNotification,
  type AppUserRole,
} from "../../../backend/appNotifications";

export function useAppNotifications(role: AppUserRole, recipientId: string) {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    const remember = (rows: AppNotification[]) => {
      rows.forEach(item => seen.add(item.id));
    };
    const alertFor = (item: AppNotification) => {
      if (item.readAt || seen.has(item.id)) return;
      seen.add(item.id);
      if (item.senderRole && item.senderRole !== role) {
        void showPushNotification(item.title, item.body);
      }
    };
    const refresh = async () => {
      if (!recipientId) return;
      const next = await loadAppNotifications(role, recipientId);
      if (!active) return;
      const firstLoad = seen.size === 0;
      if (!firstLoad) next.forEach(alertFor);
      remember(next);
      setItems(next);
    };
    void refresh();
    void enablePushNotifications();
    const onChange = () => { void refresh(); };
    window.addEventListener(APP_NOTIFICATIONS_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    const poll = window.setInterval(() => { void refresh(); }, 8000);
    const unsubscribe = subscribeAppNotifications(role, recipientId, item => {
      setItems(current => [item, ...current.filter(row => row.id !== item.id)].slice(0, 40));
      alertFor(item);
    });
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
      unsubscribe();
    };
  }, [role, recipientId]);

  const unread = useMemo(() => items.filter(item => !item.readAt).length, [items]);
  const markRead = async (id: string) => {
    setItems(current => current.map(item => item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item));
    await markAppNotificationRead(id);
  };
  return { items, unread, markRead };
}
