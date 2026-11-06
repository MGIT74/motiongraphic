import { NextResponse, type NextRequest } from "next/server";
import { validateTemplateCode } from "@/lib/templates/custom-model";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireActiveSession } from "@/lib/studio/mcp-tokens";

/**
 * Validateur autoritaire du code source de template (pipeline).
 * Aucun exécutable ici : renvoie les constats (règles interdites).
 * L'appelant browser ne prend AUCUNE décision de sécurité lui-même.
 */
export async function POST(request: NextRequest) {
  // API privée (audit #4) : en mode connecté, session requise et statut
  // vérifié côté serveur ; en démo locale, aucun changement de confort.
  if (isSupabaseConfigured()) {
    const session = await requireActiveSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, errors: [session.reason] }, { status: session.status });
    }
  }
  let code: unknown;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = body.code;
  } catch {
    return NextResponse.json({ ok: false, errors: ["Corps de requête invalide."] }, { status: 400 });
  }
  if (typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json({ ok: false, errors: ["Code requis."] }, { status: 400 });
  }
  if (code.length > 60_000) {
    return NextResponse.json({ ok: false, errors: ["Code trop volumineux (60 000 max)."] }, { status: 400 });
  }
  const report = validateTemplateCode(code);
  return NextResponse.json({ ok: report.ok, report });
}