import { supabase } from "./supabase";
import { isMobileApp } from "../frontend/MobileApp/isMobileApp";

export type AppUserRole = "parent" | "teacher";
export type AppNotificationKind = "attendance" | "health" | "classroom" | "message";

export type AppNotification = {
  id: string;
  recipientRole: AppUserRole;
  recipientId: string;
  senderRole: AppUserRole | null;
  senderId: string | null;
  senderName: string;
  childId: string | null;
  childName: string | null;
  kind: AppNotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export const APP_NOTIFICATIONS_CHANGED = "learnease-app-notifications";
const LOCAL_KEY = "learnease.appNotifications";

export type SendAppNotificationInput = {
  recipients: Array<{ role: AppUserRole; id: string }>;
  senderRole?: AppUserRole;
  senderId?: string;
  senderName?: string;
  childId?: string | null;
  childName?: string | null;
  kind: AppNotificationKind;
  title: string;
  body: string;
};

function isSchemaError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find|relation|does not exist/i.test(error.message));
}

function notifyChanged() {
  window.dispatchEvent(new Event(APP_NOTIFICATIONS_CHANGED));
}

function mapRow(row: Record<string, unknown>): AppNotification {
  const kind = String(row.kind || "message");
  return {
    id: String(row.id),
    recipientRole: row.recipient_role === "teacher" ? "teacher" : "parent",
    recipientId: String(row.recipient_id || ""),
    senderRole: row.sender_role === "teacher" || row.sender_role === "parent" ? row.sender_role : null,
    senderId: row.sender_id ? String(row.sender_id) : null,
    senderName: String(row.sender_name || "LearnEase"),
    childId: row.child_id ? String(row.child_id) : null,
    childName: row.child_name ? String(row.child_name) : null,
    kind: kind === "health" || kind === "attendance" || kind === "classroom" ? kind : "message",
    title: String(row.title || "Notification"),
    body: String(row.body || ""),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function readLocal(): AppNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items: AppNotification[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 80)));
}

function mergeLists(remote: AppNotification[], local: AppNotification[], role: AppUserRole, recipientId: string) {
  const mine = local.filter(item => item.recipientRole === role && item.recipientId === recipientId);
  const seen = new Set(remote.map(item => item.id));
  return [...remote, ...mine.filter(item => !seen.has(item.id))]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 40);
}

export async function loadAppNotifications(role: AppUserRole, recipientId: string): Promise<AppNotification[]> {
  if (!recipientId) return [];
  const local = readLocal();
  const { data, error } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("recipient_role", role)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (!isSchemaError(error)) console.warn("Notifications lookup error:", error.message);
    return mergeLists([], local, role, recipientId);
  }
  return mergeLists((data ?? []).map(row => mapRow(row as Record<string, unknown>)), local, role, recipientId);
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const readAt = new Date().toISOString();
  writeLocal(readLocal().map(item => item.id === id ? { ...item, readAt } : item));
  notifyChanged();
  const { error } = await supabase.from("app_notifications").update({ read_at: readAt }).eq("id", id);
  if (error && !isSchemaError(error)) console.warn("Notification mark-read error:", error.message);
}

export async function markAllAppNotificationsRead(role: AppUserRole, recipientId: string): Promise<void> {
  const readAt = new Date().toISOString();
  writeLocal(readLocal().map(item => (
    item.recipientRole === role && item.recipientId === recipientId ? { ...item, readAt } : item
  )));
  notifyChanged();
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: readAt })
    .eq("recipient_role", role)
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error && !isSchemaError(error)) console.warn("Notification mark-all-read error:", error.message);
}

export async function sendAppNotifications(input: SendAppNotificationInput): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("Subject and message are required.");
  const recipients = input.recipients.filter(row => row.id);
  if (!recipients.length) throw new Error("No linked parent account to notify.");

  const payloads = recipients.map(recipient => ({
    recipient_role: recipient.role,
    recipient_id: recipient.id,
    sender_role: input.senderRole ?? null,
    sender_id: input.senderId ?? null,
    sender_name: input.senderName?.trim() || "LearnEase",
    child_id: input.childId ?? null,
    child_name: input.childName ?? null,
    kind: input.kind,
    title,
    body,
  }));

  const { data, error } = await supabase.from("app_notifications").insert(payloads).select("*");
  if (error) {
    if (!isSchemaError(error)) throw error;
    const now = new Date().toISOString();
    const fallback = payloads.map((row, index) => mapRow({
      ...row,
      id: `local-${now}-${index}`,
      created_at: now,
      read_at: null,
    }));
    writeLocal([...fallback, ...readLocal()]);
  } else {
    const saved = (data ?? []).map(row => mapRow(row as Record<string, unknown>));
    writeLocal([...saved, ...readLocal()]);
  }
  notifyChanged();
}

export async function classroomParentIds(): Promise<string[]> {
  const { data, error } = await supabase.from("children_accounts").select("parent_id");
  if (error) return [];
  return [...new Set((data ?? []).map(row => String(row.parent_id || "")).filter(Boolean))];
}

export async function enablePushNotifications(): Promise<boolean> {
  if (isMobileApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const status = await LocalNotifications.requestPermissions();
      if (status.display === "granted") return true;
    } catch {
      /* plugin not installed in this build */
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function showPushNotification(title: string, body: string): Promise<void> {
  if (isMobileApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [{
          title,
          body,
          id: Date.now() % 2147483647,
        }],
      });
      return;
    } catch {
      /* fall through to web notifications */
    }
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    /* some browsers only allow this after a user gesture */
  }
}

export function subscribeAppNotifications(
  role: AppUserRole,
  recipientId: string,
  onInsert: (item: AppNotification) => void,
) {
  if (!recipientId) return () => undefined;
  const channel = supabase
    .channel(`app-notifications-${role}-${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "app_notifications",
        filter: `recipient_id=eq.${recipientId}`,
      },
      payload => {
        const item = mapRow(payload.new as Record<string, unknown>);
        if (item.recipientRole !== role) return;
        onInsert(item);
        notifyChanged();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
