import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Missing portal configuration. Add .env.local and restart the app.",
    );
  return (client ??= createClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }));
}
