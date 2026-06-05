import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let instance: SupabaseClient | null = null;

export function createClient() {
  if (!instance) {
    instance = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return instance;
}
