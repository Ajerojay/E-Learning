import { createClient } from "@supabase/supabase-js";

// ===== SUPABASE DATABASE CONNECTION =====
// Both the web version and Android/Capacitor app use this same client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
