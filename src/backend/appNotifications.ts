import { supabase } from "./supabase";
import { isMobileApp } from "../frontend/MobileApp/isMobileApp";
import pushNotificationIcon from "../../images/push-notification-icon.png";

export type AppUserRole = "parent" | "teacher";
export type AppNotificationKind = "attendance" | "health" | "classroom" | "emergency" | "message";

export type NoticeAttachment = {
  name: string;
  text: string;
};

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
  attachment: NoticeAttachment | null;
  readAt: string | null;
  createdAt: string;
};

export const APP_NOTIFICATIONS_CHANGED = "learnease-app-notifications";
export const CLASSROOM_TEACHER_RECIPIENT = "classroom";

export async function classroomTeacherRecipients() {
  const ids = new Set<string>([CLASSROOM_TEACHER_RECIPIENT]);
  const { data, error } = await supabase.from("teacher_profiles").select("teacher_id,full_name");
  if (!error) {
    for (const row of data ?? []) {
      const id = String(row.teacher_id || "").trim();
      if (id) ids.add(id);
      const name = String(row.full_name || "").trim().toLowerCase();
      if (name) ids.add(`username:${name}`);
    }
  }
  return [...ids].map((id) => ({ role: "teacher" as const, id }));
}
const LOCAL_KEY = "learnease.appNotifications";
const READ_KEY = "learnease.appNotificationReads";

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
  attachment?: NoticeAttachment | null;
};

const FILE_MARK = "[[LEARNEASE_FILE]]";

export function encodeNoticeBody(message: string, attachment?: NoticeAttachment | null) {
  const note = message.trim();
  if (!attachment?.text.trim()) return note;
  return `${note}\n\n${FILE_MARK}${JSON.stringify({ name: attachment.name, text: attachment.text })}`;
}

export function decodeNoticeBody(raw: string): { message: string; attachment: NoticeAttachment | null } {
  const body = String(raw || "");
  const markAt = body.indexOf(FILE_MARK);
  if (markAt >= 0) {
    try {
      const parsed = JSON.parse(body.slice(markAt + FILE_MARK.length).trim()) as { name?: string; text?: string };
      return {
        message: body.slice(0, markAt).trim(),
        attachment: {
          name: String(parsed.name || "Attendance.pdf"),
          text: String(parsed.text || ""),
        },
      };
    } catch {
      return { message: body.slice(0, markAt).trim(), attachment: null };
    }
  }
  const legacyAt = body.search(/\n---\s*Monthly attendance record/i);
  if (legacyAt >= 0) {
    const text = body.slice(legacyAt).trim();
    const month = text.match(/\(([^)]+)\)/)?.[1] || "Attendance";
    return {
      message: body.slice(0, legacyAt).trim(),
      attachment: { name: `${month} Attendance.pdf`, text },
    };
  }
  return { message: body.trim(), attachment: null };
}

function isSchemaError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find|relation|does not exist/i.test(error.message));
}

function isAccessError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /permission denied|not allowed|row-level security|rls|42501/i.test(error.message));
}

function notifyChanged() {
  window.dispatchEvent(new Event(APP_NOTIFICATIONS_CHANGED));
}

function mapRow(row: Record<string, unknown>): AppNotification {
  const kind = String(row.kind || "message");
  const decoded = decodeNoticeBody(String(row.body || ""));
  return {
    id: String(row.id),
    recipientRole: row.recipient_role === "teacher" ? "teacher" : "parent",
    recipientId: String(row.recipient_id || ""),
    senderRole: row.sender_role === "teacher" || row.sender_role === "parent" ? row.sender_role : null,
    senderId: row.sender_id ? String(row.sender_id) : null,
    senderName: String(row.sender_name || "LearnEase"),
    childId: row.child_id ? String(row.child_id) : null,
    childName: row.child_name ? String(row.child_name) : null,
    kind: normalizeKind(kind, String(row.title || ""), decoded.message),
    title: String(row.title || "Notification"),
    body: decoded.message,
    attachment: decoded.attachment,
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function hydrateNotification(item: AppNotification): AppNotification {
  const decoded = decodeNoticeBody(item.body);
  return {
    ...item,
    body: decoded.message,
    attachment: item.attachment?.text ? item.attachment : decoded.attachment,
  };
}

function readLocal(): AppNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(row => hydrateNotification(row as AppNotification)) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: AppNotification[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 80)));
}

function readIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rememberReadId(id: string) {
  const next = [...new Set([id, ...readIds()])].slice(0, 200);
  localStorage.setItem(READ_KEY, JSON.stringify(next));
}

function rememberReadIds(ids: string[]) {
  const next = [...new Set([...ids, ...readIds()])].slice(0, 200);
  localStorage.setItem(READ_KEY, JSON.stringify(next));
}

function withLocalReads(items: AppNotification[]) {
  const marked = new Set(readIds());
  const localById = new Map(readLocal().map(item => [item.id, item]));
  return items.map(item => {
    if (item.readAt) return item;
    const local = localById.get(item.id);
    if (local?.readAt) return { ...item, readAt: local.readAt };
    if (marked.has(item.id)) return { ...item, readAt: new Date().toISOString() };
    return item;
  });
}

function mergeLists(remote: AppNotification[], local: AppNotification[], role: AppUserRole, recipientId: string) {
  const mine = local.filter(item => item.recipientRole === role && (
    item.recipientId === recipientId || (role === "teacher" && item.recipientId === CLASSROOM_TEACHER_RECIPIENT)
  ));
  const seen = new Set(remote.map(item => item.id));
  return [...remote, ...mine.filter(item => !seen.has(item.id))]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 40);
}

async function teacherAllergyCardNotifications(): Promise<AppNotification[]> {
  const cards = await supabase.from("child_allergies").select("child_id, items, updated_at");
  const rows = cards.error ? [] : (cards.data ?? []);
  if (!rows.length) {
    const fallback = await supabase.from("children_accounts").select("id, parent_allergies, child_name, first_name, last_name");
    if (fallback.error) return [];
    return (fallback.data ?? []).flatMap(row => allergyNoticeFromRow(
      String(row.id),
      row.parent_allergies,
      String(row.child_name || "").trim() || `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      null,
    ));
  }
  const ids = rows.map(row => String(row.child_id));
  const names = await supabase.from("children_accounts").select("id, child_name, first_name, last_name").in("id", ids);
  const nameById = new Map((names.data ?? []).map(row => [
    String(row.id),
    String(row.child_name || "").trim() || `${row.first_name || ""} ${row.last_name || ""}`.trim(),
  ]));
  return rows.flatMap(row => allergyNoticeFromRow(
    String(row.child_id),
    row.items,
    nameById.get(String(row.child_id)) || "",
    typeof row.updated_at === "string" ? row.updated_at : null,
  ));
}

function allergyNoticeFromRow(childId: string, items: unknown, childName: string, updatedAt: string | null): AppNotification[] {
  const list = Array.isArray(items) ? items : [];
  const lines = list
    .map(row => {
      if (!row || typeof row !== "object") return "";
      const name = String((row as { name?: unknown }).name ?? "").trim();
      const description = String((row as { description?: unknown }).description ?? "").trim();
      if (!name) return "";
      return description ? `${name} — ${description}` : name;
    })
    .filter(Boolean);
  if (!lines.length) return [];
  const label = childName.trim() || "a learner";
  const id = `allergy-${childId}`;
  const localRead = readLocal().find(item => item.id === id)?.readAt
    ?? (readIds().includes(id) ? new Date().toISOString() : null);
  return [{
    id,
    recipientRole: "teacher",
    recipientId: CLASSROOM_TEACHER_RECIPIENT,
    senderRole: "parent",
    senderId: null,
    senderName: "Parent",
    childId,
    childName: label,
    kind: "health",
    title: `Allergy card — ${label}`,
    body: `${label}'s parent listed: ${lines.join("; ")}`,
    attachment: null,
    readAt: localRead,
    createdAt: updatedAt || new Date().toISOString(),
  }];
}

function announcementRowForParent(row: Record<string, unknown>, parentId: string): boolean {
  if (row.is_active === false) return false;
  const rowParentId = row.parent_id ? String(row.parent_id) : "";
  if (rowParentId) return rowParentId === parentId;
  if (row.target_all === true) return true;
  if (row.created_by && String(row.created_by) === parentId) return true;
  return row.target_all == null && !row.created_by;
}

function normalizeKind(kind: string, title = "", body = ""): AppNotificationKind {
  const text = `${title} ${body}`.toLowerCase();
  if (/\bemergency\b/.test(text)) return "emergency";
  if (/\battendance\b/.test(text)) return "attendance";
  if (kind === "emergency" || kind === "attendance" || kind === "classroom" || kind === "health") return kind;
  if (/\ballergy\b|\bhealth\b/.test(text)) return "health";
  return "message";
}

function announcementKindOf(row: Record<string, unknown>): AppNotificationKind {
  const title = String(row.title || row.headline || "");
  const body = String(row.body || row.message || row.content || "");
  const kind = normalizeKind(String(row.kind || row.type || "").toLowerCase(), title, body);
  if (kind !== "message") return kind;
  if (row.target_all === true) return "classroom";
  return "classroom";
}

function announcementAsNotification(row: Record<string, unknown>, parentId: string): AppNotification {
  const kind = announcementKindOf(row);
  const decoded = decodeNoticeBody(String(row.body || row.message || row.content || ""));
  return {
    id: `announcement-${row.id ?? row.created_at ?? Date.now()}`,
    recipientRole: "parent",
    recipientId: parentId,
    senderRole: "teacher",
    senderId: null,
    senderName: "Teacher",
    childId: row.child_id ? String(row.child_id) : null,
    childName: row.child_name ? String(row.child_name) : null,
    kind,
    title: String(row.title || row.headline || "Notification"),
    body: decoded.message,
    attachment: decoded.attachment,
    readAt: null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function parentAnnouncementNotifications(parentId: string): Promise<AppNotification[]> {
  const lookups = [
    () => supabase.from("parent_announcements").select("*").or(`parent_id.eq.${parentId},target_all.eq.true,created_by.eq.${parentId}`).order("created_at", { ascending: false }).limit(40),
    () => supabase.from("parent_announcements").select("*").or(`target_all.eq.true,created_by.eq.${parentId}`).order("created_at", { ascending: false }).limit(40),
    () => supabase.from("parent_announcements").select("*").order("created_at", { ascending: false }).limit(40),
  ];
  for (const lookup of lookups) {
    const { data, error } = await lookup();
    if (error) {
      if (!isSchemaError(error)) console.warn("Announcement inbox lookup error:", error.message);
      continue;
    }
    return (data ?? [])
      .filter(row => announcementRowForParent(row as Record<string, unknown>, parentId))
      .map(row => announcementAsNotification(row as Record<string, unknown>, parentId))
      .filter(item => item.title.trim() && item.body.trim());
  }
  return [];
}

function fingerprint(item: AppNotification) {
  return `${item.title.trim()}|${item.body.trim()}`;
}

export async function loadAppNotifications(role: AppUserRole, recipientId: string): Promise<AppNotification[]> {
  if (!recipientId) return [];
  const local = readLocal();
  let remote: AppNotification[] = [];
  try {
    let query = supabase
      .from("app_notifications")
      .select("*")
      .eq("recipient_role", role)
      .order("created_at", { ascending: false })
      .limit(40);
    query = role === "teacher"
      ? query.or(`recipient_id.eq.${recipientId},recipient_id.eq.${CLASSROOM_TEACHER_RECIPIENT}`)
      : query.eq("recipient_id", recipientId);
    const { data, error } = await query;
    if (error) {
      if (!isSchemaError(error) && !isAccessError(error)) console.warn("Notifications lookup error:", error.message);
    } else {
      remote = (data ?? []).map(row => mapRow(row as Record<string, unknown>));
    }
  } catch (error) {
    console.warn("Notifications lookup failed:", error);
  }
  const allergyCards = role === "teacher" ? await teacherAllergyCardNotifications() : [];
  const announcements = role === "parent" ? await parentAnnouncementNotifications(recipientId) : [];
  const seenChildren = new Set(remote.map(item => item.childId).filter(Boolean));
  const extraCards = allergyCards.filter(item => !item.childId || !seenChildren.has(item.childId));
  const known = new Set([...remote, ...extraCards].map(fingerprint));
  const extraAnnouncements = announcements.filter(item => {
    if (known.has(fingerprint(item))) return false;
    return item.kind === "health" || item.kind === "attendance" || item.kind === "emergency";
  });
  const merged = withLocalReads(mergeLists([...extraAnnouncements, ...extraCards, ...remote], local, role, recipientId));
  return merged.filter(item => (
    role === "parent" ? item.senderRole !== "parent" : item.senderRole !== "teacher"
  ));
}

export const PARENT_ALLERGY_ALERT_KEY = "learnease.parentAllergyAlert";

export type ParentAllergyAlert = {
  childId: string | null;
  names: string[];
  title: string;
  body: string;
  emergency: boolean;
};

export function allergyNamesFromNotice(item: AppNotification) {
  const match = item.body.match(/Known allergies:\s*(.+?)(?:\.\s*Please contact|$)/is);
  return (match?.[1] || "")
    .split(";")
    .map(part => part.split("—")[0].trim())
    .filter(Boolean);
}

export function rememberParentAllergyAlert(item: AppNotification) {
  if (item.kind !== "health" && item.kind !== "emergency") return;
  const payload: ParentAllergyAlert = {
    childId: item.childId,
    names: allergyNamesFromNotice(item),
    title: item.title,
    body: item.body,
    emergency: item.kind === "emergency",
  };
  sessionStorage.setItem(PARENT_ALLERGY_ALERT_KEY, JSON.stringify(payload));
}

export function readParentAllergyAlert(): ParentAllergyAlert | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PARENT_ALLERGY_ALERT_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      childId: parsed.childId ? String(parsed.childId) : null,
      names: Array.isArray(parsed.names) ? parsed.names.map(String).filter(Boolean) : [],
      title: String(parsed.title || ""),
      body: String(parsed.body || ""),
      emergency: Boolean(parsed.emergency),
    };
  } catch {
    return null;
  }
}

export function clearParentAllergyAlert() {
  sessionStorage.removeItem(PARENT_ALLERGY_ALERT_KEY);
}

export function notificationDestination(item: AppNotification, viewer: AppUserRole) {
  if (viewer === "teacher") {
    if (item.kind === "health" || item.kind === "emergency") return { teacherPage: "health" as const, parentPath: "/parent-dashboard" };
    if (item.kind === "attendance") return { teacherPage: "attendance" as const, parentPath: "/parent-dashboard" };
    if (item.kind === "classroom") return { teacherPage: "announcements" as const, parentPath: "/parent-dashboard" };
    return { teacherPage: "dashboard" as const, parentPath: "/parent-dashboard" };
  }
  if (item.kind === "health" || item.kind === "emergency") {
    return { teacherPage: "health" as const, parentPath: "/parent-children?focus=allergy" };
  }
  if (item.kind === "attendance") {
    return { teacherPage: "attendance" as const, parentPath: `/parent-children?focus=attendance&notice=${encodeURIComponent(item.id)}` };
  }
  return { teacherPage: "announcements" as const, parentPath: "/parent-dashboard" };
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const readAt = new Date().toISOString();
  rememberReadId(id);
  const current = readLocal();
  const index = current.findIndex(item => item.id === id);
  if (index >= 0) current[index] = { ...current[index], readAt };
  else current.unshift({
    id,
    recipientRole: "teacher",
    recipientId: CLASSROOM_TEACHER_RECIPIENT,
    senderRole: null,
    senderId: null,
    senderName: "",
    childId: null,
    childName: null,
    kind: "message",
    title: "",
    body: "",
    attachment: null,
    readAt,
    createdAt: readAt,
  });
  writeLocal(current);
  notifyChanged();
  if (/^(local-|allergy-|announcement-)/.test(id)) return;
  const { error } = await supabase.from("app_notifications").update({ read_at: readAt }).eq("id", id);
  if (error && !isSchemaError(error)) console.warn("Notification mark-read error:", error.message);
}

export async function markAllAppNotificationsRead(role: AppUserRole, recipientId: string, ids: string[] = []): Promise<void> {
  const readAt = new Date().toISOString();
  rememberReadIds(ids);
  writeLocal(readLocal().map(item => (
    item.recipientRole === role && (item.recipientId === recipientId || (role === "teacher" && item.recipientId === CLASSROOM_TEACHER_RECIPIENT))
      ? { ...item, readAt }
      : item
  )));
  notifyChanged();
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: readAt })
    .eq("recipient_role", role)
    .in("recipient_id", role === "teacher" ? [recipientId, CLASSROOM_TEACHER_RECIPIENT] : [recipientId])
    .is("read_at", null);
  if (error && !isSchemaError(error)) console.warn("Notification mark-all-read error:", error.message);
}

export async function sendAppNotifications(input: SendAppNotificationInput): Promise<void> {
  const title = input.title.trim();
  const body = encodeNoticeBody(input.body, input.attachment);
  if (!title || !input.body.trim()) throw new Error("Subject and message are required.");
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
    console.warn("In-app notification insert failed:", error.message);
    if (!isSchemaError(error) && !isAccessError(error)) throw error;
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
          smallIcon: "ic_stat_bear_bell",
          largeIcon: "ic_notification_large",
          iconColor: "#4B9FE8",
        }],
      });
      return;
    } catch {
      /* fall through to web notifications */
    }
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: pushNotificationIcon, silent: false });
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
  let channel = supabase
    .channel(`app-notifications-${role}-${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "app_notifications",
      },
      payload => {
        const item = mapRow(payload.new as Record<string, unknown>);
        if (item.recipientRole !== role) return;
        const forMe = item.recipientId === recipientId || (role === "teacher" && item.recipientId === CLASSROOM_TEACHER_RECIPIENT);
        if (!forMe) return;
        onInsert(item);
        notifyChanged();
      },
    );
  if (role === "parent") {
    channel = channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "parent_announcements",
      },
      payload => {
        const row = payload.new as Record<string, unknown>;
        if (!announcementRowForParent(row, recipientId)) return;
        const item = announcementAsNotification(row, recipientId);
        if (!item.title.trim() || !item.body.trim()) return;
        onInsert(item);
        notifyChanged();
      },
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
