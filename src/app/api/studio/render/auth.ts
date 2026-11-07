import "server-only";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Jeton MCP (Authorization: Bearer, x-auth-token ou x-api-key). */
function mcpTokenOk(request: NextRequest): boolean {
  const token = process.env.MCP_ACCESS_TOKEN;
  if (!token) return false;
  const auth = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  const given = auth || request.headers.get("x-auth-token")?.trim() || request.headers.get("x-api-key")?.trim();
  if (!given || given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/**
 * Autorise les opérations personnelles (projets, médias, rendus) :
 * utilisateur connecté ET actif (RLS user = auth.uid() applique
 * l'isolation) ou appel muni du jeton MCP administrateur existant.
 * Renvoie l'identifiant de l'utilisateur autorisé.
 */
export async function authorizeRender(request: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  if (mcpTokenOk(request)) return { ok: true, userId: process.env.MCP_USER_ID ?? "" };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, status: 503, message: "Supabase non configuré." };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Connexion requise." };
  // FAIL-CLOSED (audit) : le profil doit EXISTER avec status='active' ;
  // toute erreur de lecture ou profil absent → refus (pas d"accès par
  // acquiescement).
  const { data: profile, error: profileError } = await client.from("profiles").select("status").eq("id", user.id).maybeSingle();
  const row = (profile as { status?: string } | null);
  if (profileError || !row) {
    return { ok: false, status: 423, message: " Profil utilisateur indisponible : accès refusé." };
  }
  if (row.status === "suspended") {
    return { ok: false, status: 423, message: "COMPTE_SUSPENDU : contactez un administrateur." };
  }
  if (row.status !== "active") {
    return { ok: false, status: 423, message: "Compte non actif : accès refusé." };
  }
  return { ok: true, userId: user.id };
}

/** Origine publique de la requête (derrière nginx : x-forwarded-*). */
export function requestOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}
