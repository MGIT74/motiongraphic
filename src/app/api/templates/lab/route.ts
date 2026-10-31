import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  deleteCustomTemplate,
  listCustomTemplates,
  upsertCustomTemplate,
} from "@/lib/templates/custom-store";

/**
 * API des templates personnalisés — MODE DÉMO UNIQUEMENT
 * (store mémoire du serveur, aucun secret). En mode Supabase, l'écriture
 * passe par le client navigateur + RLS : cette route refuse alors afin
 * d'éviter de contourner les contrôles.
 */
export async function GET() {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, errors: ["Utilisez le client Supabase (RLS) en mode connecté."] },
      { status: 405 }
    );
  }
  try {
    return NextResponse.json({ ok: true, templates: await listCustomTemplates() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errors: [error instanceof Error ? error.message : String(error)] },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, errors: ["Utilisez le client Supabase (RLS) en mode connecté."] },
      { status: 405 }
    );
  }
  try {
    const body = (await request.json()) as unknown;
    const result = await upsertCustomTemplate(body);
    const status = result.ok ? 200 : 422;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json({ ok: false, errors: ["Requête invalide."] }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, errors: ["Utilisez le client Supabase (RLS) en mode connecté."] },
      { status: 405 }
    );
  }
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body?.id !== "string") {
      return NextResponse.json({ ok: false, errors: ["id requis."] }, { status: 400 });
    }
    const result = await deleteCustomTemplate(body.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch {
    return NextResponse.json({ ok: false, errors: ["Requête invalide."] }, { status: 400 });
  }
}