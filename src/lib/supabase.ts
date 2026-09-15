import { createClient } from "@supabase/supabase-js";

// ===== SUPABASE DATABASE CONNECTION =====
// Both the web version and Android/Capacitor app use this same client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://localhost.invalid";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "public-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
