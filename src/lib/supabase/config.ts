/**
 * Configuration Supabase — bascule automatique du mode démo.
 *
 * Le projet démarre SANS Supabase tant que ces variables ne sont pas
 * renseignées : voir `.env.example` et `README.md`.
 * - NEXT_PUBLIC_SUPABASE_URL      https://xxxx.supabase.co
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY clé "anon" publique (jamais la service_role)
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** true uniquement quand les deux variables publiques sont définies. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}