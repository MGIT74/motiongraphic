import "server-only";

/* ------------------------------------------------------------------ */
/* Activation des invitations — contrôle centralisé côté serveur        */
/*                                                                      */
/* Appelé pour TOUTE session d'un compte suspendu :                     */
/*   - proxy (toutes les pages privées) : direct sign-in, liens,        */
/*     renouvellements, appels API sans passer par /login ;             */
/*   - /api/auth/consume (page /login, chemin privilégié du formulaire).*/
/*                                                                      */
/* Consommation ATOMIQUE (conditionnelle) : used_at est écrit UNIQUEMENT */
/* si used_at is null AND revoked_at is null AND expires_at > now() —    */
/* les courses concurrentes voient 0 ligne (pas de double activation).  */
/* ------------------------------------------------------------------ */

export type ActivationOutcome =
  | "activated" /* invitation consommée + compte activé */
  | "active-already" /* déjà actif (connexion suivante) */
  | "suspended-admin" /* suspension administrative réelle */
  | "refused"; /* pas d'invitation valide, révoquée, expirée */

interface UpdateChain {
  eq: (col: string, value: unknown) => UpdateChain;
  is: (col: string, value: null | boolean) => UpdateChain;
  gt: (col: string, value: unknown) => UpdateChain;
  select: (sel: string) => PromiseLike<unknown>;
}
interface ServiceClientLike {
  from: (table: string) => {
    select: (sel: string) => { eq: (c: string, v: unknown) => Queryable; order?: never } & Queryable;
    update: (row: Record<string, unknown>) => UpdateChain;
    eq: (col: string, value: unknown) => UpdateChain;
    order: (col: string, opts?: { ascending?: boolean }) => unknown;
    limit: (n: number) => unknown;
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<unknown>;
  };
  auth: { updateUserById: (id: string, attrs: Record<string, unknown>) => PromiseLike<unknown> };
}
interface Queryable extends PromiseLike<unknown> {
  eq: (col: string, value: unknown) => Queryable;
  order: (col: string, opts?: { ascending?: boolean }) => Queryable;
  limit: (n: number) => Queryable;
}

async function serviceClient(): Promise<ServiceClientLike | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } }) as unknown as ServiceClientLike;
}

interface InvitationRecord {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

function isExpired(invitation: InvitationRecord, now: number): boolean {
  return new Date(invitation.expires_at).getTime() <= now;
}

/**
 * Vérifie/active un compte suspendu selon son invitation :
 * - invitation EN ATTENTE → consommation ATOMIQUE (conditions sur
 *   used_at/revoked_at/expires_at) puis activation (profiles.status='active',
 *   rôle de l'invitation) — retourne "activated" ;
 * - invitation déjà utilisée + profil suspendu → suspension
 *   administrative réelle → "suspended-admin" ;
 * - invitation révoquée/expirée/absente → "refused" (+ ban Auth).
 * Fail-closed : toute erreur de lecture → "refused".
 */
export async function tryActivateSuspendedUser(
  userId: string,
  email: string | null | undefined
): Promise<ActivationOutcome> {
  const admin = await serviceClient();
  if (!email || !admin) return "refused";
  const lower = email.toLowerCase();

  try {
    const invitationQuery = (admin.from("user_invitations")
      .select("id, email, role, expires_at, used_at, revoked_at") as { eq: (c: string, v: unknown) => Queryable })
      .eq("email", lower)
      .order("invited_at", { ascending: false })
      .limit(1);
    const invitationResult = (await invitationQuery) as { data?: InvitationRecord[] | null; error?: { message: string } | null };
    if (invitationResult.error) return "refused"; // fail-closed
    const invitation = (invitationResult.data ?? [])[0] ?? null;

    if (!invitation || invitation.revoked_at || isExpired(invitation, Date.now())) {
      await banAuth(admin, userId);
      return "refused";
    }
    if (invitation.used_at) {
      // Déjà consommée = le compte avait été activé : cette suspension
      // est administrative (posée après activation par un admin).
      return "suspended-admin";
    }

    // Consommation atomique : toutes les conditions de validité portent
    // sur la LIGNE elle-même (course-safe) — un seul appel gagne, les
    // autres (et les connexions simultanées) voient 0 ligne :
    //   UPDATE user_invitations SET used_at = now()
    //   WHERE id = X AND used_at IS NULL AND revoked_at IS NULL
    //     AND expires_at > now()
    const consume = admin.from("user_invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id");
    const consumeResult = (await consume) as { data?: Array<{ id: string }> | null; error?: { message: string } | null };
    if (consumeResult.error || !consumeResult.data || consumeResult.data.length === 0) {
      // Un concurrent a gagné OU l'invitation vient d'être révoquée/expirée :
      // relecture fail-closed.
      const recheckQuery = (admin.from("user_invitations")
        .select("id, email, role, expires_at, used_at, revoked_at") as { eq: (c: string, v: unknown) => Queryable })
        .eq("id", invitation.id);
      const recheck = (await recheckQuery) as { data?: InvitationRecord[] | null; error?: { message: string } | null };
      const fresh = (recheck.data ?? [])[0] ?? null;
      if (!fresh || fresh.used_at === null || fresh.revoked_at || isExpired(fresh, Date.now())) {
        await banAuth(admin, userId);
        return "refused";
      }
      // Consommée par un appel concurrent : activation identique.
    }

    // Activation : rôle de l'invitation (admin/user) + statut actif.
    const upsert = admin.from("profiles").upsert({ id: userId, role: invitation.role, status: "active" }, { onConflict: "id" });
    const upsertResult = (await upsert) as { error?: { message: string } | null };
    if (upsertResult.error) return "refused";
    // Cohérence Auth (best effort — la vérité reste profiles + RLS).
    await admin.auth.updateUserById(userId, { app_metadata: { role: invitation.role } });
    return "activated";
  } catch {
    return "refused"; // fail-closed
  }
}

async function banAuth(admin: ServiceClientLike, userId: string): Promise<void> {
  try {
    await admin.auth.updateUserById(userId, { ban_duration: "876000h" });
  } catch {
    // le ban est un renfort : la suspension RLS/proxy s'applique déjà
  }
}

/**
 * Contrôle du statut d"un utilisateur connecté — FAIL-CLOSED (audit #5) :
 * lecture via le client session (RLS, pas de service_role requis).
 * Erreur de lecture, profil ABSENT ou statut ≠ « active » → false.
 * Le SEUL chemin de sortie pour un compte non actif reste
 * tryActivateSuspendedUser() (invitation valide) — jamais un oui par défaut.
 */
export async function isAccountActiveCheck(userId: string): Promise<boolean> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const client = await createSupabaseServerClient();
  if (!client) return false; // lecture impossible → refus
  try {
    const row = (await client.from("profiles").select("id, status").eq("id", userId).maybeSingle()) as
      { data?: { id: string; status?: string } | null; error?: { message: string } | null };
    const profile = row?.data ?? null;
    if (row?.error || !profile || profile.status !== "active") return false;
    return true;
  } catch {
    return false;
  }
}
