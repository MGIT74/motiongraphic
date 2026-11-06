import { NextResponse } from "next/server";
import { listUsersWithProfiles, listInvitations, requireAdminPrincipal } from "@/lib/admin/users-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users — utilisateurs + historique des invitations.
 * Session admin requise (403 sinon) ; jamais de secret renvoyé.
 */
export async function GET() {
  const principal = await requireAdminPrincipal();
  if (!principal.ok) {
    return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  }
  try {
    const users = await listUsersWithProfiles(principal.adminClient);
    const invitations = await listInvitations(principal.adminClient);
    return NextResponse.json(
      { ok: true, users, invitations },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lecture.";
    return NextResponse.json(
      { ok: false, errors: [`Migration 0009 requise ou erreur Supabase : ${message}`] },
      { status: 503 }
    );
  }
}
