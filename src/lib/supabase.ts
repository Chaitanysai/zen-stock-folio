import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — running without cloud persistence. " +
      "Set env vars in Vercel to enable auth & sync.",
  );
}

// Never throw at import time: a hard throw here turns the entire app into a
// blank off-white screen (HTTP 200, no React mount, no console error surfaced
// to the user). AuthContext exposes `isConfigured` so Login can show a
// recoverable inline message instead.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
);
