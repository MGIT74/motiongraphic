"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Client Supabase côté navigateur (admin, favoris). Toujours avec la clé
 * "anon" : les droits sont ensuite appliqués par les politiques RLS.
 * Retourne `null` tant que Supabase n'est pas configuré.
 */
export function createSupabaseBrowserClient() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}