import { NextRequest, NextResponse } from "next/server";
import { requireAdminPrincipal, revokeInvitation } from "@/lib/admin/users-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/invitations/:id/revoke — annule une invitation
 * en attente (revoked_at = now). Une invitation révoquée ou expirée ne
 * donne plus aucun accès : la ligne est fermée côté Supabase Auth par
 * l'expiration du lien, et l'historique l'enregistre ici.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireAdminPrincipal();
  if (!principal.ok) {
    return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  }
  const outcome = await revokeInvitation(principal.adminClient, id);
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, errors: [outcome.reason ?? "Révocation impossible."] }, { status: outcome.status });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
}
