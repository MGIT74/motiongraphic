import { NextRequest, NextResponse } from "next/server";
import { emitUserToken, requireActiveSession } from "@/lib/studio/mcp-tokens";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Jetons MCP individuels — PRÉPARATOIRE ET DORMANT.                    */
/* Activation : MCP_USER_TOKENS="true" (jamais par défaut ; à coupler   */
/* ensuite à la migration 0009 exécutée). Sans drapeau : toute route    */
/* répond 503 « fonctionnalité désactivée », aucun jeton n'est émis.    */
/* ------------------------------------------------------------------ */

function disabled(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      errors: [
        "Connexions MCP individuelles non activées. Architecture prête (migration 0009, /settings/mcp) : activation serveur MCP_USER_TOKENS=\"true\" après validation ChatGPT.",
      ],
    },
    { status: 503 }
  );
}

/** GET : liste des jetons de l'utilisateur (empreintes seulement). */
export async function GET() {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
  const { data } = await client
    .from("mcp_user_tokens")
    .select("id, name, created_at, expires_at, revoked_at, last_used_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, tokens: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

/** POST : émission d'un jeton (valeur claire affichée une seule fois). */
export async function POST(request: NextRequest) {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const outcome = await emitUserToken(session.userId, typeof body.name === "string" ? body.name : "", session.userId);
  if (!outcome.created) {
    return NextResponse.json({ ok: false, errors: [outcome.reason] }, { status: 400 });
  }
  return NextResponse.json({ ok: true, token: outcome.token }, { status: 201, headers: { "cache-control": "no-store" } });
}

/** DELETE ?id=… : révocation immédiate (le jeton ne fonctionne plus). */
export async function DELETE(request: NextRequest) {
  if (process.env.MCP_USER_TOKENS !== "true") return disabled();
  const session = await requireActiveSession();
  if (!session.ok) return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
  const { data } = await client
    .from("mcp_user_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.userId)
    .is("revoked_at", null)
    .select("id");
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json({ ok: false, errors: ["Jeton introuvable ou déjà révoqué."] }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
