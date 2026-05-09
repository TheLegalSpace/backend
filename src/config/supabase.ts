import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
