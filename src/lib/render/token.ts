import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jetons signés (HMAC-SHA256) pour les URL internes du rendu : la page
 * /render/<id> et le téléchargement local d'un MP4. Le secret ne quitte
 * jamais le serveur.
 */
function secret(): string {
  const value = process.env.RENDER_SECRET || process.env.MCP_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Rendu non configuré : définissez RENDER_SECRET (ou MCP_ACCESS_TOKEN).");
  return value;
}

export function signRenderToken(scope: string, id: string): string {
  return createHmac("sha256", secret()).update(`${scope}:${id}`).digest("base64url");
}

export function verifyRenderToken(scope: string, id: string, token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const expected = Buffer.from(signRenderToken(scope, id));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}
