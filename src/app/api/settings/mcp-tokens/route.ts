import { NextRequest, NextResponse } from "next/server";
import { emitUserToken, listUserTokens, requireActiveSession, revokeToken } from "@/lib/studio/mcp-tokens";
import { rateLimited } from "@/lib/studio/mcp-scopes";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Jetons MCP personnels. DORMANT : MCP_USER_TOKENS="true" requis ;     */
/* sans drapeau toute route répond 503 et rien n'est émis.              */
/* Contrat (consommé par /settings/mcp, PR #41) :                       */
/*   GET    → { tokens: [{ id, name, scopes, createdAt, expiresAt,      */
/*                         lastUsedAt, revokedAt }] }                   */
/*   POST   { name, expiresInDays: 30|90|365, scopes } → 201            */
/*            { token (une seule fois), item }                          */
/*   DELETE ?id= → { ok: true }                                         */
/* ------------------------------------------------------------------ */

function disabled(): NextResponse {
  return NextResponse.json(
    { ok: false, errors: ["Connexions MCP individuelles pas encore activées sur ce serveur."] },
    { status: 503 }
  );
}

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const result = await listUserTokens(session.userId);
  if (!result.ok) return NextResponse.json({ ok: false, errors: [result.reason] }, { status: 503 });
  return NextResponse.json({ ok: true, tokens: result.tokens }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  if (rateLimited(`mcp-token:${session.userId}`)) {
    return NextResponse.json({ ok: false, errors: ["Trop de créations de jetons. Réessayez plus tard."] }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; expiresInDays?: unknown; scopes?: unknown };
  const outcome = await emitUserToken(session.userId, typeof body.name === "string" ? body.name : "", session.userId, {
    expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : undefined,
    scopes: Array.isArray(body.scopes) ? (body.scopes as string[]) : undefined,
  });
  if (!outcome.created) {
    return NextResponse.json({ ok: false, errors: [outcome.reason] }, { status: outcome.status ?? 400 });
  }
  return NextResponse.json({ ok: true, token: outcome.token, item: outcome.item }, { status: 201, headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  }
  const done = await revokeToken(id, session.userId, { ownerId: session.userId });
  if (!done) return NextResponse.json({ ok: false, errors: ["Jeton introuvable ou déjà révoqué."] }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
