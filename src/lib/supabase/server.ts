import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Client Supabase côté serveur (App Router) — jamais la service_role.
 * Retourne `null` tant que Supabase n'est pas configuré : le mode démo
 * prend le relais (voir `src/lib/data.ts`).
 */
export async function createSupabaseServerClient() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const store = await cookies();
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Contexte sans écriture (Server Component) : les cookies de
          // session seront rafraîchis par le proxy (session refresh).
        }
      },
    },
  });
}