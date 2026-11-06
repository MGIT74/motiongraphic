import { NextRequest, NextResponse } from "next/server";
import { inviteUser, requireAdminPrincipal } from "@/lib/admin/users-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/invite — { email, role: "user" | "admin" }.
 * Invitation envoyée par l'API Admin Supabase (côté serveur uniquement),
 * horodatée dans user_invitations (historique minimal).
 * Expiration : 14 jours. Un email déjà invité non répondu est ré-envoyé.
 */
export async function POST(request: NextRequest) {
  const principal = await requireAdminPrincipal();
  if (!principal.ok) {
    return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  }
  let body: { email?: unknown; role?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ ok: false, errors: ["Corps JSON invalide."] }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const role = typeof body.role === "string" ? body.role : "user";
  if (!email) {
    return NextResponse.json({ ok: false, errors: ["Email requis."] }, { status: 400 });
  }
  const outcome = await inviteUser(principal.adminClient, principal.userId, email, role);
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, errors: [outcome.reason ?? "Invitation impossible."] }, { status: outcome.status });
  }
  return NextResponse.json(
    { ok: true, resent: outcome.resent ?? false, invitation: outcome.invitation ?? null },
    { status: outcome.resent ? 200 : 201, headers: { "cache-control": "no-store" } }
  );
}
