import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession, rotateUserToken } from "@/lib/studio/mcp-tokens";
import { parseExpiryDays, rateLimited } from "@/lib/studio/mcp-scopes";

export const dynamic = "force-dynamic";

/** POST /api/settings/mcp-tokens/{id}/rotate — nouveau jeton, ancien révoqué. Dormant (MCP_USER_TOKENS). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (process.env.MCP_USER_TOKENS !== "true") {
    return NextResponse.json({ ok: false, errors: ["Connexions MCP individuelles pas encore activées sur ce serveur."] }, { status: 503 });
  }
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  if (rateLimited(`mcp-token:${session.userId}`)) {
    return NextResponse.json({ ok: false, errors: ["Trop de créations de jetons. Réessayez plus tard."] }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { expiresInDays?: unknown };
  const days = body.expiresInDays === undefined ? 90 : parseExpiryDays(body.expiresInDays);
  if (!days) return NextResponse.json({ ok: false, errors: ["Durée invalide (30, 90 ou 365 jours)."] }, { status: 400 });
  const outcome = await rotateUserToken(session.userId, id, days);
  if (!outcome.created) return NextResponse.json({ ok: false, errors: [outcome.reason] }, { status: outcome.status ?? 400 });
  return NextResponse.json({ ok: true, token: outcome.token, item: outcome.item }, { status: 201, headers: { "cache-control": "no-store" } });
}
