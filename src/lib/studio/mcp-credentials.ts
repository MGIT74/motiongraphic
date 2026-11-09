/**
 * Extraction du jeton MCP d'une requête.
 *
 * Les connecteurs personnalisés de claude.ai ne permettent pas d'envoyer un
 * en-tête Authorization : le jeton peut donc aussi passer par l'URL
 * (?token=…). Par défaut, seul un jeton personnel (préfixe mgsi_, révocable)
 * est accepté ainsi. Le secret administrateur historique n'est accepté en URL
 * que si MCP_QUERY_TOKEN_LEGACY === "true" (déconseillé : l'URL est journalisée).
 */
export function extractMcpCandidate(
  headers: { get(name: string): string | null },
  url: string,
  env: Record<string, string | undefined> = {}
): string {
  const authorization = headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() ?? "";
  const alternate = headers.get("x-auth-token")?.trim() || headers.get("x-api-key")?.trim() || "";
  const fromHeader = bearer || alternate.replace(/^Bearer\s+/i, "").trim();
  if (fromHeader) return fromHeader;
  let query = "";
  try {
    query = new URL(url, "http://localhost").searchParams.get("token")?.trim() ?? "";
  } catch {
    return "";
  }
  if (!query) return "";
  if (query.startsWith("mgsi_")) return query;
  return env.MCP_QUERY_TOKEN_LEGACY === "true" ? query : "";
}
