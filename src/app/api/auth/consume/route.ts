import { NextResponse } from "next/server";
import { consumeInvitationOnFirstLogin } from "@/lib/admin/users-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/consume — contrôle de la première connexion.
 * Appelé par la page /login juste après un signIn réussi :
 * - invitation en attente → consommée (used_at) + compte activé ;
 * - invitation utilisée → connexion suivante normale ;
 * - invitation révoquée/expirée/inexistante → 423 : le client est
 *   déconnecté, AUCUN accès (garde serveur réelle, cf migration 0009).
 */
export async function POST() {
  const outcome = await consumeInvitationOnFirstLogin();
  if (outcome.ok) {
    return NextResponse.json(
      { ok: true, role: outcome.role, first_login: outcome.firstLogin },
      { headers: { "cache-control": "no-store" } }
    );
  }
  return NextResponse.json({ ok: false, errors: [outcome.reason] }, { status: outcome.status });
}
