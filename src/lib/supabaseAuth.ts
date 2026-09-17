import type { User } from "@supabase/supabase-js";
import { createChildProfile, getParentChildren } from "./supabaseData";
import { supabase } from "./supabase";

export type AuthUser = {
  uid: string;
  email?: string | null;
};

export type PendingChildSignup = {
  childName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  gradeLevel: string;
  pinCode: string;
  nickname?: string;
};

export type CreatedParentAccount = {
  user: AuthUser;
  needsEmailConfirmation: boolean;
};

export type ParentSession = {
  id: string;
  username: string;
};

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isAuthEmailConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

function childMetadata(child?: PendingChildSignup): Record<string, string> {
  if (!child) return {};
  return {
    child_name: child.childName,
    child_first_name: child.firstName,
    child_last_name: child.lastName,
    child_date_of_birth: child.dateOfBirth,
    child_sex: child.sex,
    child_grade_level: child.gradeLevel,
    child_pin_code: child.pinCode,
    child_nickname: child.nickname?.trim() || "n/a",
  };
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  if (!isAuthEmailConfirmed(data.user)) {
    await supabase.auth.signOut();
    throw new Error("Please confirm your email before signing in. Check your inbox for the confirmation link.");
  }
  return { user: { uid: data.user.id, email: data.user.email } as AuthUser };
}

export async function createParentAccount(
  username: string,
  email: string,
  password: string,
  child?: PendingChildSignup
): Promise<CreatedParentAccount> {
  const normalizedUsername = normalizeUsername(username);
  const cleanEmail = email.trim().toLowerCase();

  const { data: existingParent, error: usernameCheckError } = await supabase
    .from("parents_accounts")
    .select("id")
    .eq("username", normalizedUsername)
    .maybeSingle();
  if (usernameCheckError) throw usernameCheckError;
  if (existingParent) throw new Error("This username is already registered. Choose another username.");

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/app/signin`,
      data: {
        username: normalizedUsername,
        pending_registration: true,
        ...childMetadata(child),
      },
    },
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("This email is already registered or email signup is unavailable. Use Sign in or another email.");
  if (authData.user.identities?.length === 0) {
    throw new Error("This email address is already registered. Use Sign in or reset the password.");
  }

  const confirmed = isAuthEmailConfirmed(authData.user) && Boolean(authData.session);
  if (!confirmed) {
    await supabase.auth.signOut();
    return {
      user: { uid: authData.user.id, email: authData.user.email ?? cleanEmail },
      needsEmailConfirmation: true,
    };
  }

  const parentId = await completePendingParentRegistration(authData.user, password);
  return {
    user: { uid: parentId ?? authData.user.id, email: authData.user.email ?? cleanEmail },
    needsEmailConfirmation: false,
  };
}

type ParentRow = {
  id: string;
  username: string;
  password?: string | null;
  email?: string | null;
};

async function selectParent(column: "username" | "email", value: string): Promise<ParentRow | null> {
  const withEmail = await supabase
    .from("parents_accounts")
    .select("id, username, password, email")
    .eq(column, value)
    .maybeSingle();
  if (!withEmail.error) return withEmail.data as ParentRow | null;
  if (!/column|schema cache/i.test(withEmail.error.message)) throw withEmail.error;
  if (column === "email") return null;
  const basic = await supabase
    .from("parents_accounts")
    .select("id, username, password")
    .eq(column, value)
    .maybeSingle();
  if (basic.error) throw basic.error;
  return basic.data as ParentRow | null;
}

async function findParentByUsername(username: string) {
  const candidates = Array.from(new Set([username, normalizeUsername(username)]));
  for (const value of candidates) {
    const parent = await selectParent("username", value);
    if (parent) return parent;
  }
  return null;
}

async function findParentByEmail(email: string) {
  return selectParent("email", email.trim().toLowerCase());
}

export async function completePendingParentRegistration(user: User, password?: string): Promise<string | null> {
  if (!isAuthEmailConfirmed(user)) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof meta.username === "string" ? normalizeUsername(meta.username) : "";
  const email = user.email?.trim().toLowerCase() || "";

  let parentId = username ? (await findParentByUsername(username))?.id ?? null : null;
  if (!parentId && email) {
    parentId = (await findParentByEmail(email))?.id ?? null;
  }
  if (!username && !parentId) return null;

  if (!parentId) {
    const payload: Record<string, unknown> = { username };
    if (password) payload.password = password;
    if (email) payload.email = email;

    let { data: parent, error } = await supabase.from("parents_accounts").insert([payload]).select("id").single();
    if (error && /column|schema cache/i.test(error.message) && "email" in payload) {
      delete payload.email;
      const retry = await supabase.from("parents_accounts").insert([payload]).select("id").single();
      parent = retry.data;
      error = retry.error;
    }
    if (error && /null value|password/i.test(error.message) && !password) {
      return null;
    }
    if (error) throw error;
    if (!parent) throw new Error("Failed to create parent account.");
    parentId = String(parent.id);
  } else {
    const updates: Record<string, unknown> = {};
    if (password) updates.password = password;
    if (email) updates.email = email;
    if (Object.keys(updates).length) {
      const { error } = await supabase.from("parents_accounts").update(updates).eq("id", parentId);
      if (error && email && /column|schema cache/i.test(error.message)) {
        delete updates.email;
        if (Object.keys(updates).length) {
          await supabase.from("parents_accounts").update(updates).eq("id", parentId);
        }
      }
    }
  }

  const children = await getParentChildren(parentId);
  if (children.length === 0 && typeof meta.child_name === "string" && meta.child_name.trim()) {
    await createChildProfile(undefined, {
      parentId,
      childName: String(meta.child_name),
      firstName: typeof meta.child_first_name === "string" ? meta.child_first_name : undefined,
      lastName: typeof meta.child_last_name === "string" ? meta.child_last_name : undefined,
      dateOfBirth: typeof meta.child_date_of_birth === "string" ? meta.child_date_of_birth : undefined,
      sex: typeof meta.child_sex === "string" ? meta.child_sex : undefined,
      gradeLevel: typeof meta.child_grade_level === "string" ? meta.child_grade_level : undefined,
      pinCode: typeof meta.child_pin_code === "string" ? meta.child_pin_code : undefined,
      nickname: typeof meta.child_nickname === "string" && meta.child_nickname.trim() ? meta.child_nickname.trim() : "n/a",
      isActive: true,
    });
  }

  if (meta.pending_registration) {
    await supabase.auth.updateUser({ data: { pending_registration: false } });
  }

  return parentId;
}

function confirmationError(message: string): boolean {
  return /confirm|not confirmed|email not confirmed/i.test(message);
}

export async function signInParentAccount(login: string, password: string): Promise<ParentSession> {
  const cleanLogin = login.trim();
  const cleanPassword = password.trim();
  const looksLikeEmail = cleanLogin.includes("@");
  let parent: ParentRow | null = null;
  try {
    parent = looksLikeEmail
      ? await findParentByEmail(cleanLogin)
      : await findParentByUsername(cleanLogin);
    if (!parent && looksLikeEmail) {
      parent = await findParentByUsername(cleanLogin.split("@")[0] ?? "");
    }
    if (!parent && !looksLikeEmail) {
      parent = await findParentByEmail(cleanLogin);
    }
  } catch (error) {
    console.warn("Parent table lookup failed:", error);
  }
  const authEmail = looksLikeEmail
    ? cleanLogin.toLowerCase()
    : String(parent?.email ?? "").trim().toLowerCase();

  if (authEmail) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: cleanPassword,
      });
      if (error && confirmationError(error.message)) {
        throw new Error("Please confirm your email before signing in. Check your inbox for the confirmation link.");
      }
      if (!error && data.user) {
        if (!isAuthEmailConfirmed(data.user)) {
          await supabase.auth.signOut();
          throw new Error("Please confirm your email before signing in. Check your inbox for the confirmation link.");
        }
        const parentId = (await completePendingParentRegistration(data.user, cleanPassword)) ?? parent?.id ?? null;
        if (parentId) {
          const meta = data.user.user_metadata as { username?: string };
          return {
            id: String(parentId),
            username: String(parent?.username || meta.username || cleanLogin),
          };
        }
      }
    } catch (error) {
      if (error instanceof Error && confirmationError(error.message)) throw error;
      console.warn("Supabase auth sign-in skipped:", error);
    }
    if (looksLikeEmail && !parent) {
      throw new Error("Invalid email or password.");
    }
  }

  if (parent && String(parent.password ?? "") === cleanPassword) {
    return { id: String(parent.id), username: String(parent.username) };
  }

  throw new Error("Invalid username or email, or wrong password. If you just signed up, confirm your email first.");
}

export function sendPasswordReset(email: string): Promise<void> {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase()).then(({ error }) => {
    if (error) throw error;
  });
}

export function resendVerificationEmail(email: string): Promise<void> {
  return supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase() }).then(({ error }) => {
    if (error) throw error;
  });
}

export function signOutSupabase(): Promise<void> {
  return supabase.auth.signOut().then(({ error }) => {
    if (error) throw error;
  });
}
