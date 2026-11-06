import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/* ------------------------------------------------------------------ */
/* Accès administrateur (session requise) — clé service_role           */
/* utilisée UNIQUEMENT ici, jamais transitée vers le navigateur.       */
/* ------------------------------------------------------------------ */

export type AdminPrincipal =
  | { ok: true; userId: string; adminClient: AdminSupabase }
  | { ok: false; status: 401 | 403 | 404 | 423 | 503; reason: string };

/** Chaînage PostgREST minimal utilisé ici (typage volontairement souple
 * pour accepter tables et builders variés sans `any` explicite). */
type PostgrestChain = {
  select: (sel?: string) => PostgrestChain;
  eq: (col: string, value: unknown) => PostgrestChain;
  neq?: (col: string, value: unknown) => PostgrestChain;
  in: (col: string, values: unknown[]) => PostgrestChain;
  is: (col: string, value: null | boolean) => PostgrestChain;
  upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PostgrestChain;
  update: (row: Record<string, unknown>) => PostgrestChain;
  insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => PostgrestChain;
  order: (col: string, opts?: { ascending?: boolean }) => PostgrestChain;
  limit: (n: number) => PostgrestChain;
  single: () => PromiseLike<unknown>;
  maybeSingle: () => PromiseLike<unknown>;
} & PromiseLike<unknown>;

/** Type minimal des fonctions auth.admin utilisées (supabase-js v2). */
interface AdminSupabase {
  from: (table: string) => PostgrestChain;
  auth: {
    listUsers: (opts?: { page?: number; perPage?: number }) => PromiseLike<{
      data: { users: AdminAuthUser[] } | null;
      error: { message: string } | null;
    }>;
    inviteUserByEmail: (email: string, opts?: Record<string, unknown>) => PromiseLike<{
      data: { user: AdminAuthUser | null } | null;
      error: { message: string; status?: number } | null;
    }>;
    updateUserById: (id: string, attrs: Record<string, unknown>) => PromiseLike<{
      data: { user: AdminAuthUser } | null;
      error: { message: string } | null;
    }>;
  };
}

export interface AdminAuthUser {
  id: string;
  email: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
}

async function adminServiceClient(): Promise<AdminSupabase> {
  const { createClient } = await import("@supabase/supabase-js");
  const { supabaseUrl } = await import("@/lib/supabase/config");
  const url = supabaseUrl();
  return createClient(url as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  }) as unknown as AdminSupabase;
}

/**
 * Vérifie la session + le rôle admin du visiteur, prépare le client
 * service_role. Réponses honnêtes : 503 (démo sans Supabase), 401
 * (non connecté), 403 (non admin), 423 (admin suspendu).
 */
export async function requireAdminPrincipal(): Promise<AdminPrincipal> {
  const client = await createSupabaseServerClient();
  if (!client || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 503, reason: "Administration indisponible : Supabase/service_role non configuré (mode démo)." };
  }
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, status: 401, reason: "Connexion requise." };
  const { data: profile } = await client
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin") return { ok: false, status: 403, reason: "Administration requise." };
  if ((profile as { status?: string } | null)?.status === "suspended") {
    return { ok: false, status: 423, reason: "COMPTE_SUSPENDU : contactez un autre administrateur." };
  }
  return { ok: true, userId: user.id, adminClient: await adminServiceClient() };
}

/* ------------------------------------------------------------------ */
/* Lecture : utilisateurs + historique des invitations                  */
/* ------------------------------------------------------------------ */

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  auth_banned: boolean;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  invited_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export async function listUsersWithProfiles(admin: AdminSupabase): Promise<AdminUserRow[]> {
  const { data: authData } = await admin.auth.listUsers({ page: 1, perPage: 200 });
  const users = authData?.users ?? [];
  const ids = users.map((u) => u.id);
  const profiles: Record<string, { role?: string; status?: string }> = {};
  if (ids.length > 0) {
    const listed = await admin.from("profiles").select("id, role, status").in("id", ids);
    const data = (await listed) as { data?: unknown };
    for (const row of (data ?? []) as Array<{ id: string; role?: string; status?: string }>) {
      profiles[row.id] = row;
    }
  }
  return users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    role: profiles[u.id]?.role ?? "user",
    status: profiles[u.id]?.status ?? "active",
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    auth_banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
  }));
}

export async function listInvitations(admin: AdminSupabase): Promise<InvitationRow[]> {
  const listed = await admin
    .from("user_invitations")
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .order("invited_at", { ascending: false })
    .limit(100);
  const data = (await listed) as { data?: InvitationRow[] | null };
  return data.data ?? [];
}

/* ------------------------------------------------------------------ */
/* Invitation                                                           */
/* ------------------------------------------------------------------ */

export interface InviteOutcome {
  ok: boolean;
  status: number;
  reason?: string;
  invitation?: InvitationRow | null;
  resent?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invitation sécurisée côté serveur :
 * - email unique avec invitation en cours (index partiel) ;
 * - expiration 14 jours ;
 * - envoi par l'API Admin Supabase (email invite) ;
 * - aucune exposition de secret : le token d'invitation est géré par
 *   Supabase Auth (le historique applicatif ne stocke que le statut).
 */
export async function inviteUser(
  admin: AdminSupabase,
  invitedBy: string,
  email: string,
  role: string
): Promise<InviteOutcome> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { ok: false, status: 400, reason: "Email invalide." };
  if (role !== "user" && role !== "admin") return { ok: false, status: 400, reason: "Rôle invalide." };

  // Déjà des utilisateurs ? (doublon email)
  const { data: authData } = await admin.auth.listUsers({ page: 1, perPage: 200 });
  const existing = (authData?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === clean);
  if (existing) {
    return { ok: false, status: 409, reason: "Un compte existe déjà pour cet email." };
  }

  // Invitation en cours ? → régénérer (ré-envoi) au lieu d'un doublon.
  const pending = await admin
    .from("user_invitations")
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .eq("email", clean)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  const pendingRow = (pending as { data?: InvitationRow | null })?.data ?? null;

  const invited = await admin.auth.inviteUserByEmail(clean, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://studio.motiongraphic.si"}/login`,
  });
  if (invited.error) {
    const status = invited.error.status ?? 500;
    return { ok: false, status, reason: `Supabase Auth : ${invited.error.message}` };
  }

  if (pendingRow) {
    // Remet l'horloge d'expiration à zéro (ré-envoi de la même invitation).
    const updated = await admin
      .from("user_invitations")
      .update({ expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(), invited_by: invitedBy })
      .eq("id", pendingRow.id)
      .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
      .single();
    return { ok: true, status: 200, resent: true, invitation: (updated as { data?: InvitationRow })?.data ?? pendingRow };
  }

  const inserted = await admin
    .from("user_invitations")
    .insert({ email: clean, role, invited_by: invitedBy })
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .single();
  const invitation = (inserted as { data?: InvitationRow })?.data ?? null;
  if (!invitation) {
    return { ok: false, status: 500, reason: "Historique d'invitation indisponible (migration 0009 requise)." };
  }
  return { ok: true, status: 201, invitation };
}

export async function revokeInvitation(
  admin: AdminSupabase,
  id: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const updated = await admin
    .from("user_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .is("revoked_at", null);
  const err = (updated as { error?: { message: string } | null })?.error;
  const updated0 = (updated as { data?: unknown[] | null })?.data;
  if (err) return { ok: false, status: 500, reason: err.message };
  if (!updated0 || (Array.isArray(updated0) && updated0.length === 0)) {
    return { ok: false, status: 404, reason: "Invitation introuvable, déjà utilisée ou déjà révoquée." };
  }
  return { ok: true, status: 200 };
}

/* ------------------------------------------------------------------ */
/* Rôle et statut                                                       */
/* ------------------------------------------------------------------ */

export async function setUserRole(
  admin: AdminSupabase,
  id: string,
  role: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (role !== "user" && role !== "admin") return { ok: false, status: 400, reason: "Rôle invalide." };
  const updated = await admin.auth.updateUserById(id, { app_metadata: { role } });
  const err = (updated as { error?: { message: string } | null })?.error;
  if (err) return { ok: false, status: 500, reason: `Supabase Auth : ${err.message}` };
  const profile = await admin.from("profiles").upsert({ id, role }, { onConflict: "id" });
  const perr = (profile as { error?: { message: string } | null })?.error;
  if (perr) return { ok: false, status: 500, reason: perr.message };
  return { ok: true, status: 200 };
}

/**
 * Suspension / réactivation :
 * - ban Auth (les sessions et futures connexions sont refusées) ;
 * - profiles.status (les écritures de données sont bloquées par le
 *   trigger 0009, même avec un JWT encore valide).
 */
export async function setUserStatus(
  admin: AdminSupabase,
  id: string,
  status: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (status !== "suspended" && status !== "active") {
    return { ok: false, status: 400, reason: "Statut invalide (active | suspended)." };
  }
  const banned = status === "suspended";
  // "876000h" ≈ 100 ans : suspension durable (levée manuelle).
  const updated = await admin.auth.updateUserById(id, {
    ban_duration: banned ? "876000h" : "none",
  });
  const err = (updated as { error?: { message: string } | null })?.error;
  if (err) return { ok: false, status: 500, reason: `Supabase Auth : ${err.message}` };
  const profile = await admin.from("profiles").upsert(
    { id, status },
    { onConflict: "id" }
  );
  const perr = (profile as { error?: { message: string } | null })?.error;
  if (perr) return { ok: false, status: 500, reason: perr.message };
  return { ok: true, status: 200 };
}
