import { createClient } from "@supabase/supabase-js";
import { networkFetch } from "./networkFetch";

// ===== SUPABASE DATABASE CONNECTION =====
// Both the web version and Android/Capacitor app use this same client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://localhost.invalid";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "public-anon-key";

function readEmailLink() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    path: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    type: params.get("type") || hash.get("type") || "",
    tokenHash: params.get("token_hash") || "",
    code: params.get("code") || "",
    accessToken: hash.get("access_token") || "",
    error: hash.get("error_description") || params.get("error_description") || hash.get("error") || params.get("error") || "",
  };
}

// Captured before the auth client reads the address, because a confirmation
// or recovery link is removed from the URL once the session is created.
export const pendingEmailLink = readEmailLink();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: networkFetch },
});
