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
}

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
}

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
    .select("id, user_id, token_hash, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const row = (data as TokenRow | null) ?? null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
  // Le compte doit rester actif (une suspension coupe aussi le MCP perso).
  const { data: profile } = await client
    .from("profiles")
    .select("status")
    .eq("id", row.user_id)
    .maybeSingle();
  if ((profile as { status?: string } | null)?.status === "suspended") return null;
  // Métadonnée d'usage (best effort, non bloquante).
  try {
    await client.from("mcp_user_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  } catch {
    // journalisation d'usage : ne jamais empêcher la requête
  }
  return { userId: row.user_id, tokenId: row.id };
}

/* ------------------------------------------------------------------ */
/* Émission / gestion (routes /api/settings/mcp-tokens, dormant)        */
/* ------------------------------------------------------------------ */

/**
 * Crée un jeton personnel pour l'utilisateur connecté (drapeau requis).
 * Retourne la valeur claire UNE SEULE FOIS.
 */
export async function emitUserToken(
  userId: string,
  name: string,
  createdBy: string
): Promise<{ created: true; token: string } | { created: false; reason: string }> {
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 60) {
    return { created: false, reason: "Nom du jeton invalide (1 à 60 caractères)." };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { created: false, reason: "Supabase non configuré." };
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { token, tokenHash } = mintUserToken();
  const { error } = await client
    .from("mcp_user_tokens")
    .insert({ user_id: userId, name: name.trim(), token_hash: tokenHash, created_by: createdBy });
  if (error) return { created: false, reason: `Émission impossible : ${error.message}` };
  return { created: true, token };
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
  const { data: profile } = await client.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if ((profile as { status?: string } | null)?.status === "suspended") {
    return { ok: false, status: 423, reason: "COMPTE_SUSPENDU : contactez un administrateur." };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
}
