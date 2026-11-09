/* Permissions des jetons MCP personnels. Module pur (testable sans serveur).
 *   read   : lire (templates, projets, timeline, médias, rendus)
 *   write  : créer/modifier projets, scènes, éléments, médias
 *   export : lancer un export MP4 (render_project)
 * Un outil absent de la table est traité comme « write » (fail-closed : jamais ouvert par oubli).
 * Le principal « legacy » (admin) n'est pas soumis aux permissions. */

export const MCP_SCOPES = ["read", "write", "export"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export const MAX_ACTIVE_TOKENS_PER_USER = 10;

const READ_TOOLS = new Set([
  "list_templates", "get_template_schema", "list_projects", "get_timeline",
  "preview_frame", "get_render", "list_media",
]);

export function scopeForTool(toolName: string): McpScope {
  if (toolName === "render_project") return "export";
  if (READ_TOOLS.has(toolName)) return "read";
  return "write";
}

/** « write » implique « read » : un jeton qui peut modifier peut aussi lire. */
export function scopesAllow(granted: readonly string[] | undefined, needed: McpScope): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes(needed)) return true;
  return needed === "read" && granted.includes("write");
}

/** Valide et normalise les permissions demandées (1 à 3, valeurs connues, sans doublon). */
export function parseScopes(input: unknown): McpScope[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MCP_SCOPES.length) return null;
  const out: McpScope[] = [];
  for (const value of input) {
    if (typeof value !== "string" || !(MCP_SCOPES as readonly string[]).includes(value)) return null;
    if (!out.includes(value as McpScope)) out.push(value as McpScope);
  }
  return out;
}

export function parseExpiryDays(input: unknown): (typeof TOKEN_EXPIRY_DAYS)[number] | null {
  return (TOKEN_EXPIRY_DAYS as readonly unknown[]).includes(input) ? (input as (typeof TOKEN_EXPIRY_DAYS)[number]) : null;
}

/** Limiteur en mémoire (par processus) : au plus `max` actions par `windowMs` et par clé. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max = 10, windowMs = 3600_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/** Aperçus MCP des utilisateurs (non admin) : 20 par 10 min et par utilisateur, 2 en parallèle sur le serveur. */
let previewsRunning = 0;
export const MAX_PARALLEL_PREVIEWS = 2;
export function acquirePreviewSlot(userId: string, now = Date.now()): "ok" | "rate" | "busy" {
  if (rateLimited(`preview:${userId}`, 20, 600_000, now)) return "rate";
  if (previewsRunning >= MAX_PARALLEL_PREVIEWS) return "busy";
  previewsRunning += 1;
  return "ok";
}
export function releasePreviewSlot(): void {
  previewsRunning = Math.max(0, previewsRunning - 1);
}
