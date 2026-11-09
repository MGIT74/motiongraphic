import { NextRequest, NextResponse } from "next/server";
import { requireAdminPrincipal } from "@/lib/admin/users-store";
import { listAllTokens, revokeToken } from "@/lib/studio/mcp-tokens";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function disabled(): NextResponse {
  return NextResponse.json({ ok: false, errors: ["Connexions MCP individuelles pas encore activées sur ce serveur."] }, { status: 503 });
}

/** GET /api/admin/mcp-tokens — tous les jetons (empreintes jamais renvoyées). Admin actif requis. */
export async function GET() {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const principal = await requireAdminPrincipal();
  if (!principal.ok) return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  const result = await listAllTokens();
  if (!result.ok) return NextResponse.json({ ok: false, errors: [result.reason] }, { status: 503 });
  return NextResponse.json({ ok: true, tokens: result.tokens }, { headers: NO_STORE });
}

/** DELETE /api/admin/mcp-tokens?id= — révocation par un administrateur (journalisée). */
export async function DELETE(request: NextRequest) {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const principal = await requireAdminPrincipal();
  if (!principal.ok) return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  const done = await revokeToken(id, principal.userId, { admin: true });
  if (!done) return NextResponse.json({ ok: false, errors: ["Jeton introuvable ou déjà révoqué."] }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
