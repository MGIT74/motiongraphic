import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

export type McpPrincipal = { userId: string; kind: "user" | "legacy" };
const principalStore = new AsyncLocalStorage<McpPrincipal>();

export function withMcpPrincipal<T>(principal: McpPrincipal, run: () => Promise<T>): Promise<T> {
  return principalStore.run(principal, run);
}

export function requireMcpPrincipal(): McpPrincipal {
  const principal = principalStore.getStore();
  if (!principal) throw new Error("MCP: identité utilisateur absente.");
  return principal;
}

/** Authentifie un JWT Supabase signé et non expiré via Supabase Auth.
 * L'ancien secret serveur reste accepté pour préserver la connexion Claude admin.
 * Un jeton utilisateur n'est jamais traité comme le jeton administrateur.
 */
export async function authenticateMcpRequest(request: Request): Promise<McpPrincipal | null> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() ?? "";
  const alternate = request.headers.get("x-auth-token")?.trim() || request.headers.get("x-api-key")?.trim() || "";
  const legacy = process.env.MCP_ACCESS_TOKEN;
  const candidate = bearer || alternate.replace(/^Bearer\s+/i, "").trim();
  if (!candidate) return null;
  if (legacy && safeEqual(candidate, legacy) && process.env.MCP_USER_ID) {
    return { userId: process.env.MCP_USER_ID, kind: "legacy" };
  }
  // Jetons MCP personnels (PRÉPARATOIRE V1) : inactifs tant que le drapeau
  // serveur MCP_USER_TOKENS n'est pas activé explicitement (jamais par
  // défaut). Vérification : hash, révocation, expiration, compte actif.
  if (candidate.startsWith("mgsi_") && process.env.MCP_USER_TOKENS === "true") {
    const { verifyUserToken } = await import("./mcp-tokens");
    const principal = await verifyUserToken(candidate).catch(() => null);
    if (principal) return { userId: principal.userId, kind: "user" };
    return null;
  }
  // Activation explicite après revue sécurité et tests d’isolation des ressources.
  if (process.env.MCP_ENABLE_USER_TOKENS !== "true") return null;
  // En mode multi-utilisateur, seuls les Bearer JWT vérifiés sont acceptés.
  if (!bearer || !supabaseUrl() || !supabaseAnonKey()) return null;
  const client = createClient(supabaseUrl()!, supabaseAnonKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user?.id) return null;
  return { userId: data.user.id, kind: "user" };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
