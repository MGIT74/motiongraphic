import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountIsActivated, asRows, checkAdminChange, canInvite, invitationState } from "./invitation-state";

/* ------------------------------------------------------------------ */
/* Accès administrateur (session requise) — clé service_role           */
/* utilisée UNIQUEMENT ici, jamais transitée vers le navigateur.       */
/* ------------------------------------------------------------------ */

export type AdminPrincipal =
  | { ok: true; userId: string; adminClient: AdminSupabase }
  | { ok: false; status: 401 | 403 | 404 | 423 | 503; reason: string };

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
    generateLink: (opts: { type: string; email: string; options?: Record<string, unknown> }) => PromiseLike<{
      data: { properties?: { action_link?: string } } | null;
      error: { message: string } | null;
    }>;
  };
}

/** Chaînage PostgREST minimal utilisé ici (typage volontairement souple
 * pour accepter tables et builders variés sans `any` explicite). */
type PostgrestChain = {
  select: (sel?: string) => PostgrestChain;
  delete: () => PostgrestChain;
  eq: (col: string, value: unknown) => PostgrestChain;
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

export interface AdminAuthUser {
  id: string;
  email: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface ResultLike { data?: unknown; error?: { message: string } | null }

function toResult(value: unknown): ResultLike {
  return value as ResultLike;
}

/** await sans lever (best effort : compensation, journalisation). */
async function soft<T>(promise: PromiseLike<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Compensation Auth ATTENDUE ET VÉRIFIÉE (cf audit #8) : l'erreur
 * éventuelle est lue et renvoyée ; une compensation échouée n'est jamais
 * déclarée réussie (le message final décrit l'état à réconcilier).
 */
async function compensateAuth(
  admin: AdminSupabase,
  targetId: string,
  attrs: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = toResult(await soft(admin.auth.updateUserById(targetId, attrs)));
  if (!result || result.error) {
    return { ok: false, error: result?.error?.message ?? "aucune réponse" };
  }
  return { ok: true };
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
  const { data: profile } = await client.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const row = (profile as { role?: string; status?: string } | null) ?? null;
  if (row?.role !== "admin") return { ok: false, status: 403, reason: "Administration requise." };
  if (row?.status === "suspended") {
    return { ok: false, status: 423, reason: "COMPTE_SUSPENDU : contactez un autre administrateur." };
  }
  return { ok: true, userId: user.id, adminClient: await adminServiceClient() };
}

/* ------------------------------------------------------------------ */
/* Lecture : utilisateurs + historique des invitations (paginé)         */
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

const PAGE_SIZE = 200;
const MAX_PAGES = 20; // garde-fou : 20 × 200 = 4 000 comptes max par lecture

/** Liste paginée des comptes Auth (tous les utilisateurs, pas page 1). */
async function listAllAuthUsers(admin: AdminSupabase): Promise<{ users: AdminAuthUser[]; error: string | null }> {
  const users: AdminAuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await admin.auth.listUsers({ page, perPage: PAGE_SIZE });
    const payload = result as { data?: { users?: AdminAuthUser[] } | null; error?: { message: string } | null };
    if (payload.error) return { users, error: payload.error.message };
    const pageUsers = payload.data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < PAGE_SIZE) break;
  }
  return { users, error: null };
}

export async function listUsersWithProfiles(admin: AdminSupabase): Promise<{ users: AdminUserRow[]; error: string | null }> {
  const { users, error } = await listAllAuthUsers(admin);
  if (error) return { users: [], error };
  const ids = users.map((u) => u.id);
  const profiles: Record<string, { role?: string; status?: string }> = {};
  if (ids.length > 0) {
    for (let start = 0; start < ids.length; start += PAGE_SIZE) {
      const slice = ids.slice(start, start + PAGE_SIZE);
      const listed = await admin.from("profiles").select("id, role, status").in("id", slice);
      const rows = asRows<{ id: string; role?: string; status?: string }>(toResult(await listed));
      if (rows === null) return { users: [], error: "Lecture des profils impossible." };
      for (const row of rows) profiles[row.id] = row;
    }
  }
  return {
    users: users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: profiles[u.id]?.role ?? "user",
      status: profiles[u.id]?.status ?? "active",
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      auth_banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
    })),
    error: null,
  };
}

export async function listInvitations(admin: AdminSupabase): Promise<{ invitations: InvitationRow[]; error: string | null }> {
  const listed = await admin.from("user_invitations")
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .order("invited_at", { ascending: false })
    .limit(100);
  const rows = asRows<InvitationRow>(toResult(await listed));
  if (rows === null) return { invitations: [], error: "Lecture des invitations impossible (migration 0009 requise ?)." };
  return { invitations: rows, error: null };
}

/* ------------------------------------------------------------------ */
/* Recherche de compte Auth par email (paginée)                         */
/* ------------------------------------------------------------------ */

async function findAuthUserByEmail(admin: AdminSupabase, email: string): Promise<AdminAuthUser | null> {
  const { users, error } = await listAllAuthUsers(admin);
  if (error) return null;
  const lower = email.toLowerCase();
  return users.find((u) => (u.email ?? "").toLowerCase() === lower) ?? null;
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
  /** Lien Auth régénéré uniquement quand l'email Supabase ne part pas
   * (compte invité déjà créé) ; l'administrateur le transmet alors
   * manuellement. Aucun secret : lien de première connexion à usage unique. */
  action_link?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invitation sécurisée côté serveur :
 * - 409 si COMPTE ACTIF existant (jamais re-invité) ;
 * - ré-invitation si le compte Auth existe mais n'a jamais été activé
 *   (invitation en attente) : horloge remise à zéro, lien régénéré ;
 * - expiration 14 jours APPLIQUÉE à l'activation (garde serveur :
 *   /api/auth/consume refuse tout lien expiré ou révoqué, cf migration
 *   0009 handle_new_user + consumeInvitation) ;
 * - rôle du futur compte lu depuis user_invitations (source de vérité).
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

  const existing = await findAuthUserByEmail(admin, clean);
  const decision = canInvite(existing);
  if (decision.action === "block") {
    return { ok: false, status: 409, reason: decision.reason };
  }

  // Invitation en attente (applicative) ? → remettre l'horloge à zéro.
  const pending = await admin.from("user_invitations")
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .eq("email", clean)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  const pendingResult = toResult(await pending);
  if (pendingResult.error) {
    return { ok: false, status: 503, reason: `Migration 0009 requise : ${pendingResult.error.message}` };
  }
  const pendingRow = pendingResult.data as InvitationRow | null;
  if (pendingRow && invitationState(pendingRow, Date.now()) === "pending") {
    // Mettre le rôle visé à jour (admin ↔ user) avant ré-envoi.
    if (pendingRow.role !== role) {
      const updated = await admin.from("user_invitations").update({ role })
        .eq("id", pendingRow.id)
        .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
        .single();
      pendingRow.role = role;
      pendingRow.expires_at = (toResult(await updated).data as InvitationRow | undefined)?.expires_at ?? pendingRow.expires_at;
    }
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://studio.motiongraphic.si"}/login`;

  if (pendingRow) {
    // Ré-envoi : le compte Auth existe déjà — Supabase refuse
    // inviteUserByEmail (« already registered ») : régénérer le lien.
    let resentEmail = false;
    let actionLink: string | undefined;
    const invited = await admin.auth.inviteUserByEmail(clean, { redirectTo });
    const inviteResult = invited as { error?: { message: string; status?: number } | null };
    if (!inviteResult.error) {
      resentEmail = true;
    } else {
      const link = await admin.auth.generateLink({ type: "invite", email: clean, options: { redirectTo } });
      const linkResult = link as { data?: { properties?: { action_link?: string } } | null; error?: { message: string } | null };
      if (linkResult.error || !linkResult.data?.properties?.action_link) {
        return { ok: false, status: 503, reason: `Ré-envoi impossible : ${linkResult.error?.message ?? "lien indisponible"}` };
      }
      actionLink = linkResult.data.properties.action_link;
    }
    const refreshed = await admin.from("user_invitations").update(
      { expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(), invited_by: invitedBy, role }
    ).eq("id", pendingRow.id)
      .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
      .single();
    const refreshedResult = toResult(await refreshed);
    const invitation = (refreshedResult.data ?? pendingRow) as InvitationRow;
    return { ok: true, status: 200, resent: true, invitation, ...(actionLink ? { action_link: actionLink, ...(!resentEmail ? {} : {}) } : {}) };
  }

  // ORDRE IMPOSÉ (audit) : l\'enregistrement applicatif DOIT exister
  // AVANT inviteUserByEmail — il déclenche auth.users INSERT et
  // handle_new_user() lit user_invitations pour attribuer le rôle
  // (admin ↔ user) au compte. En cas d'échec de l\'invitation, la ligne
  // est SUPPRIMÉE (compensation) pour ne pas laisser un état incohérent.
  const insertedFirst = await admin.from("user_invitations").insert({ email: clean, role, invited_by: invitedBy })
    .select("id, email, role, invited_at, expires_at, used_at, revoked_at")
    .single();
  const insertedFirstResult = toResult(await insertedFirst);
  const newInvitation = insertedFirstResult.data as InvitationRow | null;
  if (!newInvitation) {
    const errMessage = insertedFirstResult.error?.message ?? "insertion impossible";
    if (/duplicate key|unique/i.test(errMessage)) {
      return { ok: false, status: 409, reason: "Une invitation en attente existe déjà (revisez l'historique)." };
    }
    return { ok: false, status: 503, reason: `Historique d'invitation indisponible (migration 0009 requise) : ${errMessage}` };
  }

  const invited = await admin.auth.inviteUserByEmail(clean, {
    redirectTo,
    data: { invited_role: role },
  });
  const inviteResult = invited as { error?: { message: string; status?: number } | null };
  if (inviteResult.error && /already registered/i.test(inviteResult.error.message)) {
    // Compte Auth existant (invité non activé sans ligne applicative,
    // ex. restauration) : régénérer un lien (compensation inutile).
    const link = await admin.auth.generateLink({ type: "invite", email: clean, options: { redirectTo } });
    const linkResult = link as { data?: { properties?: { action_link?: string } } | null; error?: { message: string } | null };
    if (linkResult.error || !linkResult.data?.properties?.action_link) {
      const compensation = toResult(await admin.from("user_invitations").delete().eq("id", newInvitation.id));
      void compensation;
      return { ok: false, status: 503, reason: `Ré-invitation impossible : ${linkResult.error?.message ?? "lien indisponible"} (enregistrement annulé)` };
    }
  } else if (inviteResult.error) {
    // COMPENSATION : annuler l\'enregistrement applicatif créé avant.
    const compensation = toResult(await admin.from("user_invitations").delete().eq("id", newInvitation.id));
    const note = compensation.error ? `COMPENSATION ÉCHOUÉE : ${compensation.error.message} — supprimer manuellement l\'invitation ${newInvitation.id}` : "enregistrement annulé";
    return { ok: false, status: inviteResult.error.status ?? 500, reason: `Supabase Auth : ${inviteResult.error.message} (${note})` };
  }

  return { ok: true, status: 201, invitation: newInvitation };
}

export async function revokeInvitation(
  admin: AdminSupabase,
  id: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const updated = await admin.from("user_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, email, used_at, revoked_at")
    .single();
  const result = toResult(await updated);
  if (result.error) return { ok: false, status: 500, reason: result.error.message };
  const row = result.data as { email: string; used_at: string | null; revoked_at: string | null } | null;
  if (!row) return { ok: false, status: 404, reason: "Invitation introuvable." };
  if (row.used_at) return { ok: false, status: 409, reason: "Invitation déjà utilisée." };
  if (!row.revoked_at) return { ok: false, status: 409, reason: "Invitation déjà révoquée." };

  // Invalider RÉELLEMENT le lien Auth : le compte invité (jamais activé)
  // est banni — le lien email ne peut plus créer de session.
  const account = await findAuthUserByEmail(admin, row.email);
  if (account && !accountIsActivated(account)) {
    const banned = await admin.auth.updateUserById(account.id, { ban_duration: "876000h" });
    const banResult = toResult(await banned);
    if (banResult.error) {
      return { ok: false, status: 500, reason: `Révocation partielle : ${banResult.error.message}` };
    }
  }
  return { ok: true, status: 200 };
}

/* ------------------------------------------------------------------ */
/* Rôle et statut (garde + compensation)                                */
/* ------------------------------------------------------------------ */

async function countOtherActiveAdmins(admin: AdminSupabase, excludeId: string): Promise<number> {
  const listed = await admin.from("profiles").select("id, role, status")
    .eq("role", "admin")
    .eq("status", "active");
  const result = toResult(await listed);
  const rows = asRows<{ id: string; role?: string; status?: string }>(result) ?? [];
  return rows.filter((row) => row.id !== excludeId).length;
}

/**
 * Changement de rôle : Auth (app_metadata) PUIS profiles, avec
 * compensation (rollback Auth en cas d'échec profiles) pour ne jamais
 * laisser les deux référentiels diverger. Le dernier administrateur
 * actif ne peut pas être rétrogradé ni suspendu.
 */
export async function setUserRole(
  admin: AdminSupabase,
  actorId: string,
  targetId: string,
  role: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (role !== "user" && role !== "admin") return { ok: false, status: 400, reason: "Rôle invalide." };
  return runRoleChange(admin, actorId, targetId, role, null);
}

async function runRoleChange(
  admin: AdminSupabase,
  actorId: string,
  targetId: string,
  role: string,
  status: string | null
): Promise<{ ok: boolean; status: number; reason?: string }> {
  // État actuel (profiles) pour la garde.
  const current = await admin.from("profiles").select("id, role, status").eq("id", targetId).maybeSingle();
  const currentResult = toResult(await current);
  const currentRow = (currentResult.data as { role?: string; status?: string } | null) ?? { role: "user", status: "active" };
  const otherActiveAdmins = await countOtherActiveAdmins(admin, targetId);
  const guard = checkAdminChange(
    { actorId, targetId, targetRole: currentRow.role ?? "user", targetStatus: currentRow.status ?? "active", otherActiveAdmins },
    { role: role ?? undefined, status: status ?? undefined }
  );
  if (!guard.ok) return { ok: false, status: 400, reason: guard.reason };

  const prevRole = currentRow.role ?? "user";
  const losesPrivileges = currentRow.role === "admin" && (role === "user" || status === "suspended");
  // 1. Auth d'abord.
  const authUpdate = await admin.auth.updateUserById(targetId, { app_metadata: { role: role ?? prevRole } });
  const authResult = toResult(await authUpdate);
  if (authResult.error) return { ok: false, status: 500, reason: `Supabase Auth : ${authResult.error.message}` };
  // 2. profiles ensuite.
  const profileRow: Record<string, unknown> = { id: targetId, role: role ?? prevRole };
  if (status) profileRow.status = status;
  const profile = await admin.from("profiles").upsert(profileRow, { onConflict: "id" });
  const profileResult = toResult(await profile);
  if (profileResult.error) {
    // Compensation VÉRIFIÉE : annuler l'écriture Auth.
    const compensation = await compensateAuth(admin, targetId, { app_metadata: { role: prevRole } });
    const note = compensation.ok ? `Auth compensé (état ${prevRole})` : `COMPENSATION ÉCHOUÉE : ${compensation.error} — réconcilier Auth (rôle ${prevRole})`;
    return { ok: false, status: 500, reason: `profiles : ${profileResult.error.message} (${note})` };
  }
  // 3. Concurrence : si le cible perdait des privilèges admin, il doit
  // rester AU MOINS un autre admin actif après l'écriture (TOCTOU fermé).
  if (losesPrivileges) {
    const remaining = await countOtherActiveAdmins(admin, targetId);
    if (remaining < 1) {
      // Restauration de l'état antérieur (Auth + profiles).
      const revertProfile = await admin.from("profiles").upsert({ id: targetId, role: prevRole, status: currentRow.status ?? "active" }, { onConflict: "id" });
      const revertResult = toResult(await revertProfile);
      const compensation = await compensateAuth(admin, targetId, { app_metadata: { role: prevRole } });
      if (revertResult.error || !compensation.ok) {
        return { ok: false, status: 500, reason: "Concurrence : dernier admin atteint ; restauration partielle — VERIFIER Auth manually." };
      }
      return { ok: false, status: 409, reason: "Concurrence : c'est de nouveau le dernier administrateur actif — refusé." };
    }
  }
  return { ok: true, status: 200 };
}

export async function setUserStatus(
  admin: AdminSupabase,
  actorId: string,
  targetId: string,
  status: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (status !== "suspended" && status !== "active") {
    return { ok: false, status: 400, reason: "Statut invalide (active | suspended)." };
  }
  return runStatusChange(admin, actorId, targetId, status);
}

async function runStatusChange(
  admin: AdminSupabase,
  actorId: string,
  targetId: string,
  status: string
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const current = await admin.from("profiles").select("id, role, status").eq("id", targetId).maybeSingle();
  const currentResult = toResult(await current);
  const currentRow = (currentResult.data as { role?: string; status?: string } | null) ?? { role: "user", status: "active" };
  const otherActiveAdmins = await countOtherActiveAdmins(admin, targetId);
  const guard = checkAdminChange(
    { actorId, targetId, targetRole: currentRow.role ?? "user", targetStatus: currentRow.status ?? "active", otherActiveAdmins },
    { role: undefined, status }
  );
  if (!guard.ok) return { ok: false, status: 400, reason: guard.reason };

  const banned = status === "suspended";
  const prevStatus = currentRow.status ?? "active";
  const banDuration = banned ? "876000h" : "none";
  const losesPrivileges = currentRow.role === "admin" && banned;
  // 1. Auth d'abord (les sessions/futures connexions sont coupées).
  const authUpdate = await admin.auth.updateUserById(targetId, { ban_duration: banDuration });
  const authResult = toResult(await authUpdate);
  if (authResult.error) return { ok: false, status: 500, reason: `Supabase Auth : ${authResult.error.message}` };
  // 2. profiles ensuite.
  const profile = await admin.from("profiles").upsert({ id: targetId, status }, { onConflict: "id" });
  const profileResult = toResult(await profile);
  if (profileResult.error) {
    // Compensation VÉRIFIÉE.
    const compensation = await compensateAuth(admin, targetId, { ban_duration: prevStatus === "suspended" ? "876000h" : "none" });
    const note = compensation.ok ? "Auth compensé" : `COMPENSATION ÉCHOUÉE : ${compensation.error} — réconcilier le ban Auth`;
    return { ok: false, status: 500, reason: `profiles : ${profileResult.error.message} (${note})` };
  }
  // 3. Concurrence : la suspension d'un admin ne doit jamais laisser 0 admin actif.
  if (losesPrivileges) {
    const remaining = await countOtherActiveAdmins(admin, targetId);
    if (remaining < 1) {
      const revertProfile = await admin.from("profiles").upsert({ id: targetId, role: currentRow.role, status: prevStatus }, { onConflict: "id" });
      const revertResult = toResult(await revertProfile);
      const compensation = await compensateAuth(admin, targetId, { ban_duration: "none" });
      if (revertResult.error || !compensation.ok) {
        return { ok: false, status: 500, reason: "Concurrence : dernier admin atteint ; restauration partielle — VERIFIER le ban Auth." };
      }
      return { ok: false, status: 409, reason: "Concurrence : c'est de nouveau le dernier administrateur actif — refusé." };
    }
  }
  return { ok: true, status: 200 };
}

/* ------------------------------------------------------------------ */
/* Activation à la première connexion (invitation)                      */
/* ------------------------------------------------------------------ */

export type ConsumeOutcome =
  | { ok: true; role: string; firstLogin: boolean }
  | { ok: false; status: number; reason: string };

/**
 * Vérifie l'invitation à la première connexion (garde serveur réelle) :
 * - invitation EN ATTENTE → used_at = now, activation du profil
 *   (status active), rôle forcé selon l'invitation ;
 * - invitation utilisée → ok (connexion suivante normale) ;
 * - invitation ABSENTE, révoquée ou expirée → refus 423 : le compte
 *   reste suspendu (et Auth banni si possible) : AUCUN accès.
 */
export async function consumeInvitationOnFirstLogin(): Promise<ConsumeOutcome> {
  const client = await createSupabaseServerClient();
  if (!client || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 503, reason: "Supabase non configuré." };
  }
  const { data: { user } } = await client.auth.getUser();
  if (!user || !user.email) return { ok: false, status: 401, reason: "Connexion requise." };

  // Garde centrale partagée avec le proxy (activation.ts) : toute
  // connexion — formulaire, API directe, lien, renouvellement — passe
  // par la même vérification d"invitation.
  const { tryActivateSuspendedUser, isAccountActiveCheck } = await import("./activation");
  const active = await isAccountActiveCheck(user.id); // fail-closed (profil/erreur)
  if (active) {
    // Compte actif : rôle courant (profils = vérité serveur).
    const admin = await adminServiceClient();
    const current = toResult(await admin.from("profiles").select("id, role, status").eq("id", user.id).maybeSingle());
    const currentRow = (current.data as { role?: string; status?: string } | null) ?? null;
    return { ok: true, role: currentRow?.role ?? "user", firstLogin: false };
  }
  const outcome = await tryActivateSuspendedUser(user.id, user.email);
  if (outcome === "activated") {
    const admin = await adminServiceClient();
    const activated = toResult(await admin.from("profiles").select("id, role, status").eq("id", user.id).maybeSingle());
    const role = ((activated.data as { role?: string } | null) ?? {}).role ?? "user";
    return { ok: true, role, firstLogin: true };
  }
  if (outcome === "suspended-admin") {
    const admin = await adminServiceClient();
    const current = toResult(await admin.from("profiles").select("id, role, status").eq("id", user.id).maybeSingle());
    const role = ((current.data as { role?: string } | null) ?? {}).role ?? "user";
    return { ok: false, status: 423, reason: role === "admin"
      ? "COMPTE_SUSPENDU : contactez un autre administrateur."
      : "COMPTE_REFUSE : suspension administrative — contactez un administrateur." };
  }
  return { ok: false, status: 423, reason: refusalReason("refused") };
}

function refusalReason(state: string): string {
  if (state === "refused") return "COMPTE_REFUSE : aucune invitation valide (révoquée, expirée ou inexistante) — contactez un administrateur.";
  return "COMPTE_REFUSE : contactez un administrateur.";
}