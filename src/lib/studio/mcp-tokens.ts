import "server-only";

import { createHash, randomBytes } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Jetons MCP individuels — PRÉPARATOIRE (V1 utilisateurs)              */
/*                                                                      */
/* ARCHITECTURE (non activée) :                                         */
/* - chaque utilisateur crée un jeton personnel depuis /settings/mcp ;  */
/* - le jeton n'est stocké QUE haché (SHA-256) dans `mcp_user_tokens`   */
/*   (migration 0009) ; la valeur claire n'est affichée qu'une fois ;   */
/* - le serveur MCP vérifie le hash, l'expiration, la révocation et le  */
/*   statut du compte avant tout accès ; l'isolation des ressources    */
/*   reste assurée par RLS (user_id = auth.uid()).                      */
/*                                                                      */
/* DORMANT : tout appel réel dépend du drapeau serveur MCP_USER_TOKENS  */
/* (jamais activé par défaut). Sans le drapeau : aucun chemin de code   */
/* ne mint, n'affiche ni n'accepte ces jetons.                          */
/* ------------------------------------------------------------------ */

import { parseExpiryDays, parseScopes, MAX_ACTIVE_TOKENS_PER_USER } from "./mcp-scopes";

const PREFIX = "mgsi_";

/** Génère un jeton clair `mgsi_<256 bits base64url>` + son empreinte SHA-256. */
export function mintUserToken(): { token: string; tokenHash: string } {
  const raw = randomBytes(32).toString("base64url");
  const token = PREFIX + raw;
  return { token, tokenHash: hashToken(token) };
}

/** Empreinte SHA-256 hexadécimale (stockée dans mcp_user_tokens.token_hash). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/** Le jeton a le format attendu (sans le valider à une base quelconque). */
export function looksLikeUserToken(candidate: string): boolean {
  return candidate.startsWith(PREFIX) && candidate.length >= PREFIX.length + 40;
}

/* ------------------------------------------------------------------ */
/* Vérification (appelée uniquement quand MCP_USER_TOKENS = "true")     */
/* ------------------------------------------------------------------ */

export interface TokenPrincipal {
  userId: string;
  tokenId: string;
  scopes: string[];
}

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  scopes: string[] | null;
}

/** `last_used_at` n'est réécrit qu'au plus une fois toutes les 5 minutes par jeton. */
const LAST_USED_THROTTLE_MS = 5 * 60_000;

/**
 * Vérifie un jeton personnel : hash connu, non révoqué, non expiré,
 * compte actif. Retourne null si l'un des contrôles échoue.
 * (Uniquement appelé quand MCP_USER_TOKENS = "true".)
 */
export async function verifyUserToken(candidate: string): Promise<TokenPrincipal | null> {
  if (!looksLikeUserToken(candidate)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // table protégée par RLS : service serveur uniquement
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const tokenHash = hashToken(candidate);
  const { data } = await client
    .from("mcp_user_tokens")
    .select("id, user_id, token_hash, expires_at, revoked_at, last_used_at, scopes")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const row = (data as TokenRow | null) ?? null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
  // Fail-closed : aucune session sans profil EXPLICITEMENT actif
  // (profil absent = refus — cf audit, un profil manquant ne doit pas
  // être traité comme un compte sain).
  const { data: profile } = await client
    .from("profiles")
    .select("status")
    .eq("id", row.user_id)
    .maybeSingle();
  const profileRow = (profile as { status?: string } | null) ?? null;
  if (!profileRow || profileRow.status !== "active") return null;
  // Métadonnée d'usage (best effort, non bloquante, limitée en fréquence).
  const last = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - last > LAST_USED_THROTTLE_MS) {
    try {
      await client.from("mcp_user_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    } catch {
      // journalisation d'usage : ne jamais empêcher la requête
    }
  }
  // Colonne `scopes` absente (0011 non appliquée) : permissions minimales par défaut, jamais « export ».
  return { userId: row.user_id, tokenId: row.id, scopes: row.scopes && row.scopes.length > 0 ? row.scopes : ["read", "write"] };
}

/* ------------------------------------------------------------------ */
/* Émission / gestion (routes /api/settings/mcp-tokens, dormant)        */
/* ------------------------------------------------------------------ */

export interface TokenItem {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface DbTokenRow {
  id: string;
  name: string;
  scopes: string[] | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  user_id?: string;
}

const ITEM_COLUMNS = "id, name, scopes, created_at, expires_at, last_used_at, revoked_at";

function toItem(row: DbTokenRow): TokenItem {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes && row.scopes.length > 0 ? row.scopes : ["read", "write"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

async function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

type ServiceClient = NonNullable<Awaited<ReturnType<typeof serviceClient>>>;

/** Journal d'audit (best effort, jamais de valeur de jeton). */
async function audit(client: ServiceClient, event: string, userId: string | null, actorId: string | null, tokenId: string | null, detail: Record<string, unknown> = {}) {
  try {
    await client.from("mcp_token_audit").insert({ event, user_id: userId, actor_id: actorId, token_id: tokenId, detail });
  } catch {
    // table absente (0011 non appliquée) ou erreur : l'audit ne bloque jamais l'action
  }
}

export type EmitResult = { created: true; token: string; item: TokenItem } | { created: false; reason: string; status?: number };

/**
 * Crée un jeton personnel (drapeau requis). Valeur claire retournée UNE SEULE FOIS.
 * `rotatedFrom` : renouvellement (l'ancien jeton est révoqué par l'appelant après succès).
 */
export async function emitUserToken(
  userId: string,
  name: string,
  createdBy: string,
  options: { expiresInDays?: number; scopes?: string[]; rotatedFrom?: string } = {}
): Promise<EmitResult> {
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 60) {
    return { created: false, reason: "Nom du jeton invalide (1 à 60 caractères).", status: 400 };
  }
  const days = parseExpiryDays(options.expiresInDays ?? 90);
  const scopes = parseScopes(options.scopes ?? ["read", "write"]);
  if (!days) return { created: false, reason: "Durée invalide (30, 90 ou 365 jours).", status: 400 };
  if (!scopes) return { created: false, reason: "Permissions invalides (read, write, export).", status: 400 };
  const client = await serviceClient();
  if (!client) return { created: false, reason: "Supabase non configuré.", status: 503 };

  if (!options.rotatedFrom) {
    const { count } = await client
      .from("mcp_user_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_ACTIVE_TOKENS_PER_USER) {
      return { created: false, reason: `Limite atteinte : ${MAX_ACTIVE_TOKENS_PER_USER} jetons actifs. Révoquez-en un d'abord.`, status: 409 };
    }
  }

  const { token, tokenHash } = mintUserToken();
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
  const { data, error } = await client
    .from("mcp_user_tokens")
    .insert({
      user_id: userId,
      name: name.trim(),
      token_hash: tokenHash,
      created_by: createdBy,
      expires_at: expiresAt,
      scopes,
      ...(options.rotatedFrom ? { rotated_from: options.rotatedFrom } : {}),
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error || !data) return { created: false, reason: `Émission impossible : ${error?.message ?? "inconnue"}`, status: 400 };
  const item = toItem(data as DbTokenRow);
  await audit(client, options.rotatedFrom ? "rotated" : "created", userId, createdBy, item.id, { scopes, days });
  return { created: true, token, item };
}

/** Liste des jetons de l'utilisateur (aucune empreinte, aucun secret). */
export async function listUserTokens(userId: string): Promise<{ ok: true; tokens: TokenItem[] } | { ok: false; reason: string }> {
  const client = await serviceClient();
  if (!client) return { ok: false, reason: "Supabase non configuré." };
  const { data, error } = await client.from("mcp_user_tokens").select(ITEM_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return { ok: false, reason: `Lecture impossible : ${error.message}` };
  return { ok: true, tokens: ((data ?? []) as DbTokenRow[]).map(toItem) };
}

/** Révoque un jeton de l'utilisateur ; `admin` : n'importe quel jeton (journalisé). */
export async function revokeToken(id: string, actorId: string, scope: { ownerId: string } | { admin: true }): Promise<boolean> {
  const client = await serviceClient();
  if (!client) return false;
  let query = client.from("mcp_user_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if ("ownerId" in scope) query = query.eq("user_id", scope.ownerId);
  const { data } = await query.select("id, user_id");
  const row = Array.isArray(data) ? (data[0] as { id: string; user_id: string } | undefined) : undefined;
  if (!row) return false;
  await audit(client, "ownerId" in scope ? "revoked" : "revoked_by_admin", row.user_id, actorId, row.id);
  return true;
}

/** Renouvelle : émet un nouveau jeton (mêmes nom/permissions, nouvelle durée) puis révoque l'ancien. */
export async function rotateUserToken(userId: string, id: string, expiresInDays?: number): Promise<EmitResult> {
  const client = await serviceClient();
  if (!client) return { created: false, reason: "Supabase non configuré.", status: 503 };
  const { data } = await client.from("mcp_user_tokens").select(ITEM_COLUMNS).eq("id", id).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  const old = (data as DbTokenRow | null) ?? null;
  if (!old) return { created: false, reason: "Jeton introuvable ou déjà révoqué.", status: 404 };
  const outcome = await emitUserToken(userId, old.name, userId, {
    expiresInDays: expiresInDays ?? 90,
    scopes: old.scopes && old.scopes.length > 0 ? old.scopes : ["read", "write"],
    rotatedFrom: old.id,
  });
  if (!outcome.created) return outcome;
  const revoked = await revokeToken(old.id, userId, { ownerId: userId });
  if (!revoked) {
    // Course (déjà révoqué entre-temps) : on ne laisse pas deux jetons actifs issus d'un renouvellement raté.
    await revokeToken(outcome.item.id, userId, { ownerId: userId });
    return { created: false, reason: "Jeton déjà révoqué : renouvellement annulé.", status: 409 };
  }
  return outcome;
}

export interface AdminTokenItem extends TokenItem {
  ownerId: string;
  ownerEmail: string | null;
  ownerStatus: string | null;
}

/** Vue administrateur : tous les jetons, avec propriétaire et statut du compte. */
export async function listAllTokens(): Promise<{ ok: true; tokens: AdminTokenItem[] } | { ok: false; reason: string }> {
  const client = await serviceClient();
  if (!client) return { ok: false, reason: "Supabase non configuré." };
  const { data, error } = await client.from("mcp_user_tokens").select(`${ITEM_COLUMNS}, user_id`).order("created_at", { ascending: false }).limit(500);
  if (error) return { ok: false, reason: `Lecture impossible : ${error.message}` };
  const rows = (data ?? []) as DbTokenRow[];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const statuses = new Map<string, string>();
  const emails = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profiles } = await client.from("profiles").select("id, status").in("id", ids);
    for (const p of (profiles ?? []) as { id: string; status: string }[]) statuses.set(p.id, p.status);
    const { data: list } = await client.auth.admin.listUsers({ perPage: 200 });
    for (const u of list?.users ?? []) emails.set(u.id, u.email ?? null);
  }
  return {
    ok: true,
    tokens: rows.map((r) => ({
      ...toItem(r),
      ownerId: r.user_id as string,
      ownerEmail: emails.get(r.user_id as string) ?? null,
      ownerStatus: statuses.get(r.user_id as string) ?? null,
    })),
  };
}

/** Refus de permission journalisé (appelé par la route MCP, jamais bloquant). */
export async function auditDenied(userId: string, tokenId: string | undefined, tool: string, needed: string) {
  const client = await serviceClient();
  if (client) await audit(client, "denied_scope", userId, userId, tokenId ?? null, { tool, needed });
}

/** Vérification du principal (session connectée, compte actif) partagée. */
export async function requireActiveSession(): Promise<
  { ok: true; userId: string; email: string | null } | { ok: false; status: number; reason: string }
> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, status: 503, reason: "Supabase non configuré." };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, status: 401, reason: "Connexion requise." };
  const { data: profile, error } = await client.from("profiles").select("status").eq("id", user.id).maybeSingle();
  const profileRow = (profile as { status?: string } | null) ?? null;
  // FAIL-CLOSED (audit #5) : profil absent, lecture en erreur ou statut
  // non « active » → refus systématique.
  if (error || !profileRow || profileRow.status !== "active") {
    return { ok: false, status: 423, reason: "Compte indisponible ou suspendu : accès refusé." };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
}
