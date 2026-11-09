import { type NextRequest, NextResponse } from "next/server";
import { scopeForTool, scopesAllow } from "@/lib/studio/mcp-scopes";
import { MCP_PROJECT_TOOLS, McpToolError, type McpToolOutput } from "@/lib/studio/mcp-server";
import { rememberBaseUrl } from "@/lib/render/engine";
import { authenticateMcpRequest, withMcpPrincipal } from "@/lib/studio/mcp-auth";

export const runtime = "nodejs";

/**
 * Serveur MCP distant — transport "Streamable HTTP" (JSON-RPC 2.0) :
 *
 *   POST /api/mcp
 *     Authorization: Bearer <MCP_ACCESS_TOKEN>   (ou x-auth-token / x-api-key: <MCP_ACCESS_TOKEN>)
 *     { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { ... } }
 *
 * Méthodes gérées : initialize, notifications/initialized, ping, tools/list,
 * tools/call. Sans session serveur (stateless, toléré par les clients MCP).
 * Les outils manipulent uniquement des données structurées : aucun code
 * exécutable ne circule.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token, X-Api-Key, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function json(id: unknown, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}

function errorResponse(id: unknown, code: number, message: string, hint?: string): NextResponse {
  const data = hint ? { hint } : undefined;
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message, data } },
    { status: 200, headers: CORS }
  );
}

// Codes d'erreur JSON-RPC standard
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

// Protocole LATEST utilisé pour les annonces initialize.
const PROTOCOL_VERSION = "2025-06-18";

export async function GET() {
  // Transport streamable : le serveur n'expose pas de flux SSE en V1.
  return new NextResponse(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Server pushes not available (POST-only)." } }),
    { status: 405, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

export async function POST(request: NextRequest) {
  /* ------------------------------ auth ------------------------------ */
  const principal = await authenticateMcpRequest(request);
  if (!principal) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Authentification MCP requise." } },
      { status: 401, headers: { ...CORS, "WWW-Authenticate": 'Bearer realm="MotionGraphic MCP"' } }
    );
  }

  /* ------------------------------ corps ------------------------------ */
  let body: {
    jsonrpc?: string;
    id?: unknown;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(null, PARSE_ERROR, "JSON-RPC invalide (JSON non décodable).");
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return errorResponse(body.id ?? null, INVALID_REQUEST, "Requête JSON-RPC 2.0 invalide.");
  }

  const id = body.id ?? null;
  const method = body.method;

  try {
    switch (method) {
      case "initialize": {
        const requestedVersion = (body.params as { protocolVersion?: string } | undefined)?.protocolVersion;
        return json(id, {
          protocolVersion: requestedVersion ?? PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "motiongraphic-studio",
            version: "1.0.0",
          },
          instructions:
            "Serveur MCP MotionGraphic Studio : outils de création/édition de projets vidéo (scènes, éléments animés, templates validés). Aucun code exécutable n'est accepté.",
        });
      }

      case "notifications/initialized":
      case "initialized":
        // Notification sans réponse (id undefined) — acquittement 204-like.
        return new NextResponse(null, { status: 202, headers: CORS });

      case "ping":
        return json(id, {});

      case "tools/list":
        return json(id, {
          tools: MCP_PROJECT_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });

      case "tools/call": {
        const params = body.params ?? {};
        const name = (params as { name?: unknown }).name;
        if (typeof name !== "string") {
          return errorResponse(id, INVALID_REQUEST, "tools/call : 'name' requis.");
        }
        const tool = MCP_PROJECT_TOOLS.find((t) => t.name === name);
        if (!tool) {
          return errorResponse(id, METHOD_NOT_FOUND, `Outil inconnu : ${name}`);
        }
        const input = ((params as { arguments?: unknown }).arguments ?? {}) as Record<string, unknown>;
        // Permissions du jeton personnel (lecture / écriture / export). Le jeton admin « legacy » n'est pas concerné.
        if (principal.kind === "user" && principal.scopes) {
          const needed = scopeForTool(name);
          if (!scopesAllow(principal.scopes, needed)) {
            void import("@/lib/studio/mcp-tokens").then((m) => m.auditDenied(principal.userId, principal.tokenId, name, needed)).catch(() => undefined);
            return json(id, {
              content: [{ type: "text", text: `Erreur : ce jeton n'a pas la permission « ${needed} » nécessaire pour ${name}. Créez un jeton avec cette permission dans Connexions MCP.` }],
              isError: true,
            });
          }
        }
        try {
          // Origine publique : utilisée par le rendu (navigateur interne) pour joindre l'app.
          const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
          const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
          rememberBaseUrl(`${proto}://${host}`);
          const output = (await withMcpPrincipal(principal, () => tool.run(input))) as McpToolOutput;
          return json(id, {
            content: typeof output === "string" ? [{ type: "text", text: output }] : output.content,
            isError: false,
          });
        } catch (error) {
          if (error instanceof McpToolError) {
            return json(id, {
              content: [
                { type: "text", text: `Erreur : ${error.message}${error.hint ? ` — ${error.hint}` : ""}` },
              ],
              isError: true,
            });
          }
          return json(id, {
            content: [{ type: "text", text: `Erreur inattendue : ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          });
        }
      }

      default:
        return errorResponse(id, METHOD_NOT_FOUND, `Méthode inconnue : ${method}`);
    }
  } catch {
    return errorResponse(id, INTERNAL_ERROR, "Erreur interne du serveur MCP.");
  }
}

