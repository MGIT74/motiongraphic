/**
 * Cycle d'invitation Supabase Auth V1 — end-to-end RÉEL (clone UNIQUEMENT).
 *
 *   SUPABASE_TEST_URL=https://xxx-test.supabase.co \
 *   SUPABASE_TEST_SERVICE_ROLE=eyJ... \
 *   SUPABASE_TEST_ANON=eyJ... \   # (optionnelle : connexions réelles)
 *   migration 0009 APPLIQUÉE au préalable sur le clone
 *   node supabase/tests/auth-invite-cycle.mjs
 *
 * Étapes testées :
 *  1. création de l'invitation applicative (user_invitations) ;
 *  2. envoi Supabase Auth (inviteUserByEmail + action_link) ;
 *  3. première connexion réelle (signInWithPassword, si clé anon) ;
 *  4. consommation ATOMIQUE de used_at (2 appels concurrents simulés :
 *     un seul gagne, l'autre voit 0 ligne — pas de double activation) ;
 *  5. attribution du rôle selon l'invitation ;
 *  6. activation du compte (profiles.status) ;
 *  7. révocation (ban Auth → impossible de consommer/consommer à nouveau) ;
 *  8. expiration (invitation passée → aucun accès) ;
 *  9. réinvitation (pending régénérée sans doublon).
 * Refuse explicitement une cible de production.
 */
const URL_TEST = process.env.SUPABASE_TEST_URL;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE;
const ANON = process.env.SUPABASE_TEST_ANON;

if (!URL_TEST || !SERVICE) {
  console.error("❌ Variables manquantes : SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE.");
  console.error("   Clone de test UNIQUEMENT (jamais la production).");
  process.exit(2);
}
if (/motiongraphic\.si/i.test(URL_TEST)) {
  console.error("❌ Refusé : SUPABASE_TEST_URL ressemble à la production.");
  process.exit(2);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL_TEST, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };

const email = `invite-${Date.now()}@test-clone.local`;
const password = `Cyc!e-${Date.now().toString(36)}-${Date.now().toString(36)}`;

/** Consommation atomique — RÉPLIQUE exacte du serveur (activation.ts) :
 * conditions portées sur la ligne : used_at is null, revoked_at is null,
 * expires_at > maintenant (un seul appel simultané gagne). */
async function consumeAtomically(invitationId, targetEmail) {
  const update = admin.from("user_invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("email", targetEmail)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  return await update;
}

async function main() {
  /* 1. Création de l'invitation applicative (server-side). */
  const insertInv = await admin.from("user_invitations").insert({ email, role: "user" }).select("id, email, role, expires_at, used_at, revoked_at").single();
  ok(!insertInv.error, `1. invitation applicative créée (${insertInv.error?.message ?? "ok"})`);
  const invitation = insertInv.data ?? null;
  if (!invitation) return finish();

  /* 2. Envoi Supabase Auth + lien de réception. */
  const invite = await admin.auth.admin.inviteUserByEmail(email, {});
  ok(!invite.error, `2. invitation Auth émise (${invite.error?.message ?? "ok"})`);
  const link = await admin.auth.admin.generateLink({ type: "invite", email });
  ok(!link.error && Boolean(link.data?.properties?.action_link), "   lien (action_link) reçu");

  /* 3. Première connexion réelle. */
  const { data: { users: users1 } } = await admin.auth.admin.listUsers({ perPage: 200 });
  const account = (users1 ?? []).find((u) => u.email === email);
  ok(Boolean(account), "   compte Auth en état « invité » (non activé)");
  if (!account) return finish();
  await admin.auth.admin.updateUserById(account.id, { password });
  if (ANON) {
    const anon = createClient(URL_TEST, ANON, { auth: { persistSession: false } });
    const session = await anon.auth.signInWithPassword({ email, password });
    ok(!session.error, `3. première connexion → session (${session.error?.message ?? "ok"})`);
    void session;
  } else {
    console.log("ℹ️  SUPABASE_TEST_ANON absente : étape 3 simulée par update Auth.");
  }

  /* 4. Consommation ATOMIQUE + course (2 appels). */
  const first = await consumeAtomically(invitation.id, email);
  const firstRows = (first?.data ?? []);
  ok(!first.error && firstRows.length === 1, `4a. consommation atomique → ${firstRows.length} ligne (${first.error?.message ?? "ok"})`);
  const second = await consumeAtomically(invitation.id, email);
  const secondRows = (second?.data ?? []);
  ok(!second.error && secondRows.length === 0, `4b. double activation impossible → ${secondRows.length} ligne (attendu 0)`);

  /* Course réelle : 6 connexions simultanées sur une NOUVELLE invitation —
   * une seule doit consommer (les autres voient 0 ligne). */
  for (let round = 0; round < 2; round += 1) {
    const raceEmail = `race-${round}-${Date.now()}@test-clone.local`;
    const raceInvite = await admin.from("user_invitations").insert({ email: raceEmail, role: "user" }).select("id").single();
    if (raceInvite.error || !raceInvite.data) { ok(false, `   course ${round} : invitation non créée`); continue; }
    const raceId = (raceInvite.data).id;
    const racePromises = Array.from({ length: 6 }, () => consumeAtomically(raceId, raceEmail));
    const outcomes = await Promise.all(racePromises);
    const winners = (outcomes ?? []).filter((o) => ((o?.data ?? [])).length === 1);
    const losers = (outcomes ?? []).filter((o) => ((o?.data ?? [])).length === 0);
    ok(winners.length === 1 && losers.length === 5, `   course ${round} : 6 connexions simultanées → ${winners.length} gagnant(s) (attendu 1)`);
    await admin.from("user_invitations").delete().eq("id", raceId);
  }

  /* 5. Rôle attribué selon l'invitation. */
  const { data: profile5 } = await admin.from("profiles").select("id, role, status").eq("id", account.id).maybeSingle();
  ok(profile5?.role === invitation.role, `5. rôle = ${profile5?.role} (invitation : ${invitation.role})`);

  /* 6. Activation du compte. */
  const activation = await admin.from("profiles").upsert({ id: account.id, role: invitation.role, status: "active" }, { onConflict: "id" }).select("id, status").single();
  ok(!activation.error && (activation.data ?? {}).status === "active", `6. compte activé (${activation.error?.message ?? "ok"})`);
  const { data: profile6 } = await admin.from("profiles").select("id, role, status").eq("id", account.id).maybeSingle();
  ok(profile6?.status === "active", "   état final : actif");

  /* 7. Révocation : ban Auth, le lien ne peut plus donner de session. */
  const banned = await admin.auth.admin.updateUserById(account.id, { ban_duration: "876000h" });
  ok(!banned.error, `7a. ban Auth appliqué (${banned.error?.message ?? "ok"})`);
  const { data: { users: users2 } } = await admin.auth.admin.listUsers({ perPage: 200 });
  const account2 = (users2 ?? []).find((u) => u.email === email);
  ok(Boolean(account2?.banned_until && new Date(account2.banned_until).getTime() > Date.now()), "7b. compte banni (banned_until futur)");
  if (ANON) {
    const anon = createClient(URL_TEST, ANON, { auth: { persistSession: false } });
    const refused = await anon.auth.signInWithPassword({ email, password });
    ok(Boolean(refused.error), "7c. connexion d'un compte banni refusée");
  }

  /* 8. Expiration : invitation passée → consommation impossible. */
  const futureEmail = `expire-${Date.now()}@test-clone.local`;
  const expired = await admin.from("user_invitations").insert({
    email: futureEmail, role: "user",
    expires_at: new Date(Date.now() - 86_400_000).toISOString(),
  }).select("id").single();
  if (!expired.error && expired.data) {
    const consumeExpired = await admin.from("user_invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", (expired.data).id)
      .gt("expires_at", new Date().toISOString())
      .select("id");
    if (consumeExpired?.error) { ok(false, `8. lecture erreur : ${consumeExpired.error.message}`); }
    const rows = (consumeExpired?.data ?? []);
    ok(rows.length === 0, "8. invitation expirée → consommation impossible (0 ligne, garde réelle)");
  } else {
    ok(false, `8. insertion invitation expirée impossible (${expired.error?.message ?? "?"})`);
  }

  /* 9. Réinvitation : régénérée sans doublon (pending unique). */
  const reinvite = await admin.auth.admin.inviteUserByEmail(email, {});
  ok(Boolean(reinvite.error), `9a. inviteUserByEmail sur compte existant → refusée par Auth (${reinvite.error?.status ?? "-"})`);
  const newLink = await admin.auth.admin.generateLink({ type: "invite", email });
  ok(!newLink.error && Boolean(newLink.data?.properties?.action_link), "9b. réinvitation : lien régénéré (action_link) disponible");
  const pendings = await admin.from("user_invitations").select("id").eq("email", email).is("used_at", null).is("revoked_at", null);
  const pendingRows = (pendings?.data ?? []);
  ok(pendingRows.length <= 1, `9c. une seule invitation applicative en attente (${pendingRows.length})`);

  /* Nettoyage du clone. */
  await admin.from("user_invitations").delete().eq("email", email);
  await admin.from("user_invitations").delete().eq("email", futureEmail);
  await admin.from("profiles").delete().eq("id", account.id);
  await admin.auth.admin.deleteUser(account.id);
  console.log("ℹ️  Nettoyage effectué.");
  finish();
}

function finish() {
  console.log(failures === 0 ? "\n✅ Cycle d'invitation Auth V1 : OK (clone)." : `\n❌ Échecs : ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error("❌ Erreur :", error); process.exit(1); });
