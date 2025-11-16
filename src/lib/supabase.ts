import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client partagé pour les appels depuis les composants server
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
