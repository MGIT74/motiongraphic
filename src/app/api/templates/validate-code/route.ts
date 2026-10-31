import { NextResponse, type NextRequest } from "next/server";
import { validateTemplateCode } from "@/lib/templates/custom-model";

/**
 * Validateur autoritaire du code source de template (pipeline).
 * Aucun exécutable ici : renvoie les constats (règles interdites).
 * L'appelant browser ne prend AUCUNE décision de sécurité lui-même.
 */
export async function POST(request: NextRequest) {
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