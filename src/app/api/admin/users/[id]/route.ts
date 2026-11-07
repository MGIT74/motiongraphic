import { NextRequest, NextResponse } from "next/server";
import { requireAdminPrincipal, setUserRole, setUserStatus } from "@/lib/admin/users-store";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/:id — { role?: "user"|"admin", status?: "active"|"suspended" }.
 * Le rôle est répercuté dans user_metadata.app_metadata (Auth) ET
 * profiles.role ; la suspension déclenche un ban Auth + profiles.status.
 * Un utilisateur standard qui appelle cette route reçoit 403.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireAdminPrincipal();
  if (!principal.ok) {
    return NextResponse.json({ ok: false, errors: [principal.reason] }, { status: principal.status });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, errors: ["Identifiant invalide."] }, { status: 400 });
  }
  let body: { role?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { role?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ ok: false, errors: ["Corps JSON invalide."] }, { status: 400 });
  }
  if (principal.userId === id && (body.role === "user" || body.status === "suspended")) {
    return NextResponse.json(
      { ok: false, errors: ["Un administrateur ne peut pas retirer ses propres droits ou se suspendre."] },
      { status: 400 }
    );
  }
  if (typeof body.role === "string") {
    const outcome = await setUserRole(principal.adminClient, principal.userId, id, body.role);
    if (!outcome.ok) {
      return NextResponse.json({ ok: false, errors: [outcome.reason ?? "Changement de rôle impossible."] }, { status: outcome.status });
    }
  }
  if (typeof body.status === "string") {
    const outcome = await setUserStatus(principal.adminClient, principal.userId, id, body.status);
    if (!outcome.ok) {
      return NextResponse.json({ ok: false, errors: [outcome.reason ?? "Changement de statut impossible."] }, { status: outcome.status });
    }
  }
  if (typeof body.role !== "string" && typeof body.status !== "string") {
    return NextResponse.json({ ok: false, errors: ["Rien à modifier : fournir role et/ou status."] }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
}
