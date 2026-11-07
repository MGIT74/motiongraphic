import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Gardes serveur de l'application privée — le masquage d'UI ne remplace
 * jamais ces vérifications (session vérifiée via Supabase Auth + profils).
 */

/** Session utilisateur (user OU admin) : redirige /login sinon.
 * Fail-closed : profil absent/illisible/suspendu → /login (le proxy sert
 * la page « Compte suspendu » ; aucune donnée n'est affichée). */
export async function requireUser(next = "/studio"): Promise<void> {
  if (!isSupabaseConfigured()) return; // mode démo local : pages testables en local
  const client = await createSupabaseServerClient();
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    redirect("/login" + (next ? `?next=${encodeURIComponent(next)}` : ""));
  }
  const { data: profile, error } = await client
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const row = (profile as { role?: string; status?: string } | null) ?? null;
  if (error || !row) redirect("/login"); // fail-closed
  if (row.status === "suspended" || row.status !== "active") redirect("/login");
}

/** Session administrateur : redirige /login (ou /studio pour un simple user). */
export async function requireAdmin(next = "/admin"): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = await createSupabaseServerClient();
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    redirect("/login" + (next ? `?next=${encodeURIComponent(next)}` : ""));
  }
  const { data: profile, error } = await client.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const row = (profile as { role?: string; status?: string } | null) ?? null;
  if (error || !row || row.status !== "active") redirect("/login"); // fail-closed
  if (row.role !== "admin") {
    redirect("/studio");
  }
}

/** Rôle de l'utilisateur courant ("admin", "user") ou null si non connecté. */
export async function currentUserRole(): Promise<"admin" | "user" | null> {
  if (!isSupabaseConfigured()) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  // Fail-closed : erreur/absence/suspension → le rôle n"est PAS rendu.
  const { data: profile, error } = await client
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const row = (profile as { role?: string; status?: string } | null) ?? null;
  if (error || !row || row.status !== "active") return null;
  return row.role === "admin" ? "admin" : "user";
}