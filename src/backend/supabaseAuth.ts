import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { createChildProfile, getParentChildren } from "./supabaseData";
import { pendingEmailLink, supabase } from "./supabase";
import { normalizePhMobile, saveParentPhone } from "./parentPhone";

export const RESET_PASSWORD_PATH = "/reset-password";
export const EMAIL_VERIFIED_PATH = "/email-verified";

function appRedirect(path: string): string {
  // Email links open in a browser, possibly on a different device.
  return new URL(path, "https://e-learning-5sk.pages.dev").href;
}

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
  setupPending?: boolean;
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
  child?: PendingChildSignup,
  phone?: string
): Promise<CreatedParentAccount> {
  const normalizedUsername = normalizeUsername(username);
  const cleanEmail = email.trim().toLowerCase();
  const phoneNumber = normalizePhMobile(phone || "");
  if (phone && !phoneNumber) throw new Error("Enter a valid Philippine mobile number, like 0917 123 4567.");

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
      emailRedirectTo: appRedirect(EMAIL_VERIFIED_PATH),
      data: {
        username: normalizedUsername,
        pending_registration: true,
        phone_number: phoneNumber || "",
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
    if (authData.session) {
      const { error: parentInsertError } = await insertParentAccount({
        username: normalizedUsername,
        email: cleanEmail,
        password,
        phone_number: phoneNumber,
      });
      if (parentInsertError) {
        console.warn("Parent profile will be created after email confirmation:", parentInsertError);
      }
      try { await supabase.auth.signOut({ scope: "local" }); }
      catch (error) { console.warn("Signup session cleanup failed:", error); }
    }
    return {
      user: { uid: authData.user.id, email: authData.user.email ?? cleanEmail },
      needsEmailConfirmation: true,
    };
  }

  let parentId: string | null = null;
  try {
    parentId = await completePendingParentRegistration(authData.user);
  } catch (error) {
    console.warn("Parent profile setup will retry on sign-in:", error);
  }
  return {
    user: { uid: parentId ?? authData.user.id, email: authData.user.email ?? cleanEmail },
    needsEmailConfirmation: false,
    setupPending: !parentId,
  };
}

type ParentRow = {
  id: string;
  username: string;
  password?: string | null;
  email?: string | null;
};

async function selectParent(column: "username" | "email", value: string, client = supabase): Promise<ParentRow | null> {
  const withEmail = await client
    .from("parents_accounts")
    .select("id, username, password, email")
    .eq(column, value)
    .maybeSingle();
  if (!withEmail.error) return withEmail.data as ParentRow | null;
  if (!/column|schema cache/i.test(withEmail.error.message)) throw withEmail.error;
  if (column === "email") return null;
  const basic = await client
    .from("parents_accounts")
    .select("id, username, password")
    .eq(column, value)
    .maybeSingle();
  if (basic.error) throw basic.error;
  return basic.data as ParentRow | null;
}

async function findParentByUsername(username: string, client = supabase) {
  const candidates = Array.from(new Set([username, normalizeUsername(username)]));
  for (const value of candidates) {
    const parent = await selectParent("username", value, client);
    if (parent) return parent;
  }
  return null;
}

async function findParentByEmail(email: string, client = supabase) {
  return selectParent("email", email.trim().toLowerCase(), client);
}

async function insertParentAccount(row: { username: string; email: string; password: string; phone_number: string | null }) {
  const withPhone = await supabase.from("parents_accounts").insert([row]).select("id").single();
  if (!withPhone.error) return withPhone;
  if (!/phone_number|column|schema cache/i.test(withPhone.error.message)) return withPhone;
  const { phone_number: _phone, ...rest } = row;
  return supabase.from("parents_accounts").insert([rest]).select("id").single();
}

const pendingParentSetups = new Map<string, Promise<string | null>>();

export function completePendingParentRegistration(user: User): Promise<string | null> {
  const pending = pendingParentSetups.get(user.id);
  if (pending) return pending;
  const setup = provisionParentProfile(user).finally(() => pendingParentSetups.delete(user.id));
  pendingParentSetups.set(user.id, setup);
  return setup;
}

async function provisionParentProfile(user: User): Promise<string | null> {
  if (!isAuthEmailConfirmed(user)) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof meta.username === "string" ? normalizeUsername(meta.username) : "";
  const email = user.email?.trim().toLowerCase() || "";

  const emailParent = email ? await findParentByEmail(email) : null;
  let parentId = emailParent?.id ?? null;
  if (!parentId && username) {
    const existing = await findParentByUsername(username);
    if (existing) {
      if (existing.email?.trim().toLowerCase() !== email || !email) {
        throw new Error("This username belongs to a different parent profile. Ask the LearnEase administrator for help.");
      }
      parentId = existing.id;
    }
  }
  if (!username && !parentId) return null;

  if (!parentId) {
    if (!email) return null;
    // Live parents_accounts.password is still NOT NULL; Auth stores the real
    // password. Send an empty placeholder so confirmation can finish.
    const phoneNumber = normalizePhMobile(typeof meta.phone_number === "string" ? meta.phone_number : "");
    const { data: parent, error } = await insertParentAccount({ username, email, password: "", phone_number: phoneNumber });
    if (error) throw error;
    if (!parent) throw new Error("Failed to create parent account.");
    parentId = String(parent.id);
  }

  const children = await getParentChildren(parentId);
  const signupChildExists = children.some(child =>
    child.childName?.trim() === String(meta.child_name ?? "").trim()
    && (!meta.child_date_of_birth || child.dateOfBirth === meta.child_date_of_birth)
    && (!meta.child_pin_code || child.pinCode === meta.child_pin_code),
  );
  if ((children.length === 0 || meta.pending_registration) && !signupChildExists
    && typeof meta.child_name === "string" && meta.child_name.trim()) {
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

  const phoneNumber = normalizePhMobile(typeof meta.phone_number === "string" ? meta.phone_number : "");
  if (phoneNumber) {
    try {
      await saveParentPhone(parentId, phoneNumber);
    } catch (phoneError) {
      console.warn("Parent phone could not be saved:", phoneError);
    }
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
        const parentId = (await completePendingParentRegistration(data.user)) ?? parent?.id ?? null;
        if (parentId) {
          parent = await findParentByEmail(authEmail) ?? parent;
          const meta = data.user.user_metadata as { username?: string };
          return {
            id: String(parentId),
            username: String(parent?.username || meta.username || cleanLogin),
          };
        }
      }
    } catch (error) {
      if (error instanceof Error && confirmationError(error.message)) throw error;
      if (error instanceof Error && !/invalid login credentials/i.test(error.message)) throw error;
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

export function sendPasswordReset(email: string, client = supabase): Promise<void> {
  return client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: appRedirect(RESET_PASSWORD_PATH),
  }).then(({ error }) => {
    if (error) throw error;
  });
}

export function resendVerificationEmail(email: string): Promise<void> {
  return supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: appRedirect(EMAIL_VERIFIED_PATH) },
  }).then(({ error }) => {
    if (error) throw error;
  });
}

const otpInflight = new Map<string, Promise<void>>();

function verifyTokenHash(tokenHash: string, type: string): Promise<void> {
  const allowed: EmailOtpType[] = ["recovery", "email", "signup", "invite", "magiclink", "email_change"];
  const otpType: EmailOtpType = allowed.includes(type as EmailOtpType) ? type as EmailOtpType : "signup";
  const key = `${otpType}:${tokenHash}`;
  let pending = otpInflight.get(key);
  if (!pending) {
    pending = supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash }).then(({ error }) => {
      if (error) {
        otpInflight.delete(key);
        throw error;
      }
    });
    otpInflight.set(key, pending);
  }
  return pending;
}

function emailLinkProof(kind: "recovery" | "signup"): boolean {
  const link = pendingEmailLink;
  if (link.tokenHash || link.code || link.accessToken) return true;
  if (kind === "recovery") return link.type === "recovery";
  return link.type === "signup" || link.type === "email";
}

async function waitForEmailSession(): Promise<Session | null> {
  const readSession = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
  };
  const existing = await readSession();
  if (existing) return existing;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });
    const timer = window.setTimeout(() => {
      void readSession().then(finish);
    }, 8000);
  });
}

export async function openEmailLinkSession(kind: "recovery" | "signup"): Promise<"ready" | "missing" | "wrong-type"> {
  const link = pendingEmailLink;
  if (kind === "recovery" && link.type && link.type !== "recovery") return "wrong-type";
  if (kind === "signup" && link.type === "recovery") return "wrong-type";
  if (link.error && !link.accessToken && !link.code && !link.tokenHash) {
    throw new Error(link.error);
  }
  if (!emailLinkProof(kind)) return "missing";

  if (link.tokenHash) {
    await verifyTokenHash(link.tokenHash, link.type || (kind === "recovery" ? "recovery" : "signup"));
  }

  const session = await waitForEmailSession();
  if (!session) return "missing";
  if (kind === "signup" && !isAuthEmailConfirmed(session.user)) return "missing";
  return "ready";
}

export async function updateSignedInParentPassword(password: string, client = supabase): Promise<void> {
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("This reset link has expired. Request a new one from the sign-in page.");

  const email = user.email?.trim().toLowerCase() || "";
  try {
    const parent = email ? await findParentByEmail(email, client) : null;
    if (parent?.password) {
      const { error: updateError } = await client.from("parents_accounts").update({ password }).eq("id", parent.id);
      if (updateError) console.warn("Legacy parent password record was not updated:", updateError.message);
    }
  } catch (lookupError) {
    console.warn("Could not sync the legacy parent password record:", lookupError);
  }

  try {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) console.warn("Could not close the recovery session:", signOutError.message);
  } catch (signOutError) {
    console.warn("Could not close the recovery session:", signOutError);
  }
}

export function signOutSupabase(): Promise<void> {
  return supabase.auth.signOut().then(({ error }) => {
    if (error) throw error;
  });
}
