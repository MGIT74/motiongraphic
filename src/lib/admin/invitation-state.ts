/* Machine d'état des invitations + gardes administration (pur, testable).
 * Aucun accès base : utilisé par users-store (serveur) et test:users.
 */

export type InvitationState = "pending" | "used" | "revoked" | "expired";

export interface InvitationLike {
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

/** État réel d'une invitation à un instant donné (server time passé en ms). */
export function invitationState(invitation: InvitationLike, nowMs: number): InvitationState {
  if (invitation.used_at) return "used";
  if (invitation.revoked_at) return "revoked";
  if (new Date(invitation.expires_at).getTime() <= nowMs) return "expired";
  return "pending";
}

/** L'invitation donnant accès à un compte, à cet instant. */
export function invitationGrantsAccess(invitation: InvitationLike, nowMs: number): boolean {
  return invitationState(invitation, nowMs) === "pending";
}

/* ------------------------------------------------------------------ */
/* Décision de ré-invitation                                            */
/* ------------------------------------------------------------------ */

export interface AuthAccountLike {
  last_sign_in_at?: string | null;
  /* email confirmé = compte activé (invitation acceptée) ; null = invité en attente */
  email_confirmed_at?: string | null;
}

/** Compte Auth déjà activé ? (jamais re-invitable) */
export function accountIsActivated(account: AuthAccountLike): boolean {
  return Boolean(account.last_sign_in_at) || Boolean(account.email_confirmed_at);
}

export type ReinviteDecision =
  | { action: "block"; reason: string }
  | { action: "reinvite" }
  | { action: "fresh" };

/**
 * Décide l'action pour un email demandé en invitation :
 * - compte actif existant → block (409) ;
 * - utilisateur invité pas encore activé (créé par une précédente
 *   invitation) → reinvite (régénérer/ré-envoyer, mettre le rôle à jour) ;
 * - email inconnu → fresh.
 */
export function canInvite(account: AuthAccountLike | null): ReinviteDecision {
  if (!account) return { action: "fresh" };
  if (accountIsActivated(account)) {
    return { action: "block", reason: "Un compte actif existe déjà pour cet email." };
  }
  return { action: "reinvite" };
}

/* ------------------------------------------------------------------ */
/* Gardes d'administration (rôles / suspension)                         */
/* ------------------------------------------------------------------ */

export interface AdminChangeContext {
  actorId: string;
  targetId: string;
  targetRole: string; // rôle avant changement
  targetStatus: string; // statut avant changement
  /* administrateurs actifs (hors cible) avant le changement */
  otherActiveAdmins: number;
}

export type AdminChangeResult =
  | { ok: true }
  | { ok: false; code: "self-demote" | "self-suspend" | "last-admin" | "unknown-role" | "unknown-status"; reason: string };

/**
 * Garde centralisée des changements de rôle et de statut :
 * - interdiction de se rétrograder ou se suspendre soi-même ;
 * - le dernier administrateur actif ne peut être ni rétrogradé ni
 *   suspendu (protection service continu) ;
 * - valeurs canoniques seulement.
 */
export function checkAdminChange(
  context: AdminChangeContext,
  change: { role?: string; status?: string }
): AdminChangeResult {
  if (change.role !== undefined && change.role !== "user" && change.role !== "admin") {
    return { ok: false, code: "unknown-role", reason: "Rôle invalide." };
  }
  if (change.status !== undefined && change.status !== "active" && change.status !== "suspended") {
    return { ok: false, code: "unknown-status", reason: "Statut invalide (active | suspended)." };
  }
  const demotingSelf = change.role === "user" && context.targetId === context.actorId && context.targetRole === "admin";
  if (demotingSelf) {
    return { ok: false, code: "self-demote", reason: "Un administrateur ne peut pas retirer ses propres droits." };
  }
  const suspendingSelf = change.status === "suspended" && context.targetId === context.actorId;
  if (suspendingSelf) {
    return { ok: false, code: "self-suspend", reason: "Un administrateur ne peut pas se suspendre lui-même." };
  }
  const losesAdmin =
    context.targetRole === "admin" &&
    (change.role === "user" || (change.role === undefined && change.status === "suspended"));
  if (losesAdmin && context.otherActiveAdmins < 1) {
    return { ok: false, code: "last-admin", reason: "Impossible : c'est le dernier administrateur actif." };
  }
  return { ok: true };
}


/* ------------------------------------------------------------------ */
/* Lecture des résultats Supabase (format {data, error})                */
/* ------------------------------------------------------------------ */

export interface SupabaseResultLike { data?: unknown; error?: { message: string } | null }

/** Lit {data, error} : renvoie tableau[], ou null en cas d"erreur. */
export function asRows<T>(result: SupabaseResultLike | null | undefined): T[] | null {
  if (result === undefined) return [];
  if (!result || result.error) return null;
  const data = result.data;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "length" in (data as object)) {
    return Array.from(data as ArrayLike<T>) as T[];
  }
  if (data && typeof data === "object") return [data as T]; // ligne unique
  return [];
}
