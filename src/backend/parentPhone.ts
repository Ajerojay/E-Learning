import { supabase } from "./supabase";

export type ParentSmsStatus = "sent" | "no-phone" | "unconfigured" | "failed" | "skipped";

export function normalizePhMobile(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("63") && local.length === 12) local = `0${local.slice(2)}`;
  if (local.startsWith("9") && local.length === 10) local = `0${local}`;
  return /^09\d{9}$/.test(local) ? local : null;
}

export function isValidPhMobile(value: string) {
  return Boolean(normalizePhMobile(value));
}

export function formatPhMobileDisplay(value: string | null | undefined) {
  const local = normalizePhMobile(String(value || ""));
  if (!local) return "";
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

function phoneSettingId(parentId: string) {
  return `parent-phone:${parentId}`;
}

function localPhoneKey(parentId: string) {
  return `learnease.parentPhone:${parentId}`;
}

function rememberLocalPhone(parentId: string, phone: string) {
  if (!parentId || !phone) return;
  localStorage.setItem(localPhoneKey(parentId), phone);
}

function readLocalPhone(parentId: string) {
  return normalizePhMobile(localStorage.getItem(localPhoneKey(parentId)) || "");
}

function signedInUserField(field: "username" | "email" | "id") {
  try {
    return String(JSON.parse(localStorage.getItem("user") || "{}")[field] || "").trim();
  } catch {
    return "";
  }
}

function signedInUsername() {
  return signedInUserField("username");
}

async function canonicalParentId(parentId: string) {
  const given = String(parentId || "").trim();
  if (!given) return "";
  const byId = await supabase.from("parents_accounts").select("id").eq("id", given).maybeSingle();
  if (byId.data?.id) return String(byId.data.id);

  const username = signedInUsername();
  if (username) {
    const names = [...new Set([username, username.toLowerCase()])];
    for (const name of names) {
      const byName = await supabase.from("parents_accounts").select("id").eq("username", name).maybeSingle();
      if (byName.data?.id) return String(byName.data.id);
    }
  }

  const kids = await supabase.from("children_accounts").select("parent_id").eq("parent_id", given).limit(1);
  if (kids.data?.[0]?.parent_id) return String(kids.data[0].parent_id);
  return given;
}

function parentIdsToCheck(parentId: string, extra: string[] = []) {
  return [...new Set([parentId, ...extra].map((id) => String(id || "").trim()).filter(Boolean))];
}

async function phonesFromAccounts(ids: string[]) {
  const phones: Record<string, string> = {};
  if (!ids.length) return phones;
  const { data, error } = await supabase.from("parents_accounts").select("id, phone_number").in("id", ids);
  if (error) {
    if (!/phone_number|column|schema cache|could not find/i.test(error.message)) {
      console.warn("Parent phone lookup failed:", error.message);
    }
    return phones;
  }
  for (const row of data ?? []) {
    const phone = normalizePhMobile(String((row as { phone_number?: string }).phone_number || ""));
    if (row.id && phone) phones[String(row.id)] = phone;
  }
  return phones;
}

async function phonesFromSettings(ids: string[]) {
  const phones: Record<string, string> = {};
  if (!ids.length) return phones;
  const settingIds = [...ids.map(phoneSettingId), "parent-phones"];
  const { data, error } = await supabase
    .from("class_settings")
    .select("id, activity_config")
    .in("id", settingIds);
  if (error) {
    console.warn("Parent phone store lookup failed:", error.message);
    return phones;
  }
  for (const row of data ?? []) {
    const config = (row.activity_config || {}) as Record<string, unknown>;
    if (String(row.id) === "parent-phones") {
      for (const [parentId, value] of Object.entries(config)) {
        const phone = normalizePhMobile(String(value || ""));
        if (parentId && phone) phones[parentId] = phone;
      }
      continue;
    }
    const parentId = String(row.id || "").replace(/^parent-phone:/, "");
    const phone = normalizePhMobile(String(config.phone_number || ""));
    if (parentId && phone) phones[parentId] = phone;
  }
  return phones;
}

export async function getParentPhones(parentIds: string[]): Promise<Record<string, string>> {
  const ids = parentIdsToCheck("", parentIds);
  if (!ids.length) return {};
  const [fromAccounts, fromSettings] = await Promise.all([phonesFromAccounts(ids), phonesFromSettings(ids)]);
  const phones: Record<string, string> = { ...fromAccounts, ...fromSettings };
  for (const id of ids) {
    const local = readLocalPhone(id);
    if (local && !phones[id]) phones[id] = local;
  }
  return phones;
}

export async function getParentPhone(parentId: string | null | undefined) {
  if (!parentId) return null;
  const id = await canonicalParentId(parentId);
  const phones = await getParentPhones(parentIdsToCheck(parentId, [id]));
  return phones[id] || phones[parentId] || readLocalPhone(id) || readLocalPhone(parentId);
}

async function writeParentsAccountsPhone(parentId: string, phone: string) {
  const username = signedInUsername();
  const email = signedInUserField("email").toLowerCase();
  const rpc = await supabase.rpc("save_parent_phone", { p_parent_id: parentId, p_phone: phone });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    const saved = normalizePhMobile(String((row as { phone_number?: string } | null)?.phone_number || ""));
    if (saved === phone) return saved;
  }

  const filters: Array<{ column: string; value: string }> = [
    { column: "id", value: parentId },
  ];
  if (username) filters.push({ column: "username", value: username });
  if (email) filters.push({ column: "email", value: email });

  for (const filter of filters) {
    const { data, error } = await supabase
      .from("parents_accounts")
      .update({ phone_number: phone })
      .eq(filter.column, filter.value)
      .select("id, phone_number");
    if (error) {
      console.warn("Parent account phone save failed:", error.message);
      continue;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const saved = normalizePhMobile(String((row as { phone_number?: string } | null)?.phone_number || ""));
    if (saved === phone) return saved;
  }
  return null;
}

export async function saveParentPhone(parentId: string, phone: string) {
  const normalized = normalizePhMobile(phone);
  if (!normalized) throw new Error("Enter a valid Philippine mobile number, like 0917 123 4567.");
  const id = await canonicalParentId(parentId);
  const ids = parentIdsToCheck(parentId, [id]);
  ids.forEach((key) => rememberLocalPhone(key, normalized));

  const accountPhone = await writeParentsAccountsPhone(id, normalized)
    || await writeParentsAccountsPhone(parentId, normalized);

  const stored: string[] = [];
  if (accountPhone) stored.push("parents_accounts");

  for (const key of ids) {
    const { error } = await supabase.from("class_settings").upsert({
      id: phoneSettingId(key),
      activity_config: { phone_number: normalized },
      student_access: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) console.warn("Parent phone store save failed:", error.message);
    else stored.push(key);
  }

  const directory = await supabase.from("class_settings").select("activity_config").eq("id", "parent-phones").maybeSingle();
  const map = directory.data?.activity_config && typeof directory.data.activity_config === "object"
    ? { ...(directory.data.activity_config as Record<string, string>) }
    : {};
  for (const key of ids) map[key] = normalized;
  const directorySave = await supabase.from("class_settings").upsert({
    id: "parent-phones",
    activity_config: map,
    student_access: {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (directorySave.error) console.warn("Parent phone directory save failed:", directorySave.error.message);
  else stored.push("directory");

  const saved = accountPhone || await getParentPhone(id) || await getParentPhone(parentId);
  if (!accountPhone) {
    throw new Error("The phone number could not be written to parents_accounts. Open Supabase SQL and run the parent phone update script, then tap Save again.");
  }
  if (saved !== normalized && !stored.length) {
    throw new Error("The phone number could not be saved to the database. Try again.");
  }
  return saved || normalized;
}

function smsBody(title: string, message: string) {
  const text = `LearnEase: ${title.trim()}\n${message.trim()}`.replace(/\s+\n/g, "\n").trim();
  return text.length > 320 ? `${text.slice(0, 317)}...` : text;
}

async function deliverSms(number: string, message: string) {
  try {
    const { data, error } = await supabase.functions.invoke("send-parent-sms", {
      body: { number, message },
    });
    if (!error && data && (data as { ok?: boolean }).ok !== false) return "sent" as const;
    if (error && !/not found|404|failed to send/i.test(error.message)) {
      console.warn("SMS function error:", error.message);
    }
  } catch (error) {
    console.warn("SMS function skipped:", error);
  }

  const apiKey = String(import.meta.env.VITE_SEMAPHORE_API_KEY || "").trim();
  if (!apiKey) return "unconfigured" as const;

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      number,
      message,
      sendername: String(import.meta.env.VITE_SEMAPHORE_SENDER || "SEMAPHORE"),
    }),
  });
  if (!response.ok) {
    console.warn("Semaphore SMS failed:", await response.text().catch(() => response.statusText));
    return "failed" as const;
  }
  return "sent" as const;
}

export async function saveTeacherPhone(input: {
  teacherId: string;
  name: string;
  email?: string;
  section?: string;
  avatar?: string;
  phone: string;
}) {
  const normalized = input.phone.trim() ? normalizePhMobile(input.phone) : null;
  if (input.phone.trim() && !normalized) {
    throw new Error("Enter a valid Philippine mobile number, like 0917 123 4567.");
  }
  const row = {
    teacher_id: input.teacherId,
    full_name: input.name,
    email: input.email || null,
    phone_number: normalized,
    handled_section: input.section || null,
    avatar: input.avatar || null,
    updated_at: new Date().toISOString(),
  };
  const saved = await supabase
    .from("teacher_profiles")
    .upsert(row, { onConflict: "teacher_id" })
    .select("teacher_id, phone_number")
    .maybeSingle();
  if (saved.error && /phone_number|column|schema cache|could not find/i.test(saved.error.message)) {
    const { phone_number: _phone, ...rest } = row;
    const fallback = await supabase.from("teacher_profiles").upsert(rest, { onConflict: "teacher_id" });
    if (fallback.error) throw fallback.error;
    throw new Error("Add phone_number on teacher_profiles in Supabase, then save again.");
  }
  if (saved.error) throw saved.error;
  const stored = normalizePhMobile(String(saved.data?.phone_number || ""));
  if (normalized && stored !== normalized) {
    throw new Error("The teacher phone number could not be saved to the database.");
  }
  return normalized || "";
}

export async function getTeacherPhones(): Promise<string[]> {
  const lookups = [
    () => supabase.from("teacher_profiles").select("phone_number"),
    () => supabase.from("teacher_profiles").select("mobile_number"),
  ];
  for (const lookup of lookups) {
    const { data, error } = await lookup();
    if (error) continue;
    const phones = [...new Set((data ?? []).map((row) => {
      const record = row as { phone_number?: string; mobile_number?: string };
      return normalizePhMobile(String(record.phone_number || record.mobile_number || ""));
    }).filter((phone): phone is string => Boolean(phone)))];
    return phones;
  }
  return [];
}

export async function sendSmsAlert(input: {
  phone?: string | null;
  title: string;
  message: string;
}): Promise<{ status: ParentSmsStatus; phone: string | null }> {
  const phone = normalizePhMobile(String(input.phone || ""));
  if (!phone) return { status: "no-phone", phone: null };
  try {
    const status = await deliverSms(phone, smsBody(input.title, input.message));
    return { status, phone };
  } catch (error) {
    console.warn("SMS failed:", error);
    return { status: "failed", phone };
  }
}

export async function sendParentAlertSms(input: {
  parentId?: string | null;
  title: string;
  message: string;
  enabled?: boolean;
}): Promise<{ status: ParentSmsStatus; phone: string | null }> {
  if (input.enabled === false) return { status: "skipped", phone: null };
  return sendSmsAlert({ phone: await getParentPhone(input.parentId), title: input.title, message: input.message });
}

export async function sendTeacherAlertSms(input: {
  title: string;
  message: string;
}): Promise<{ status: ParentSmsStatus; phone: string | null }> {
  const phones = await getTeacherPhones();
  if (!phones.length) return { status: "no-phone", phone: null };
  let last: { status: ParentSmsStatus; phone: string | null } = { status: "failed", phone: phones[0] };
  for (const phone of phones) {
    last = await sendSmsAlert({ phone, title: input.title, message: input.message });
  }
  return last;
}

export function parentSmsToast(status: ParentSmsStatus, phone: string | null, audience: "parent" | "teacher" = "parent") {
  const who = audience === "teacher" ? "teacher" : "parent";
  if (status === "sent" && phone) return `SMS sent to ${formatPhMobileDisplay(phone)}`;
  if (status === "no-phone") return `No ${who} phone on file for SMS`;
  if (status === "unconfigured") return "In-app notice sent. Add a Semaphore API key to send SMS";
  if (status === "failed") return "In-app notice sent, but SMS failed";
  return "";
}
