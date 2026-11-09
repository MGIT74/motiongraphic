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
    // listUsersWithProfiles / listInvitations renvoient { tableau, error } :
    // on désencapsule et on propage les erreurs Supabase au frontend.
    const usersRead = await listUsersWithProfiles(principal.adminClient);
    if (usersRead.error) {
      return NextResponse.json(
        { ok: false, errors: [`Supabase : ${usersRead.error}`] },
        { status: 503 }
      );
    }
    const invitationsRead = await listInvitations(principal.adminClient);
    if (invitationsRead.error) {
      return NextResponse.json(
        { ok: false, errors: [`Supabase : ${invitationsRead.error}`] },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: true, users: usersRead.users, invitations: invitationsRead.invitations },
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
