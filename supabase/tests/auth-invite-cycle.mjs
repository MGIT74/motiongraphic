/**
 * Cycle d'invitation Supabase Auth — end-to-end RÉEL (à exécuter sur un CLONE).
 *
 *   SUPABASE_TEST_URL=https://xxx-test.supabase.co \
 *   SUPABASE_TEST_SERVICE_ROLE=eyJ... \
 *   SUPABASE_TEST_ANON=eyJ... \
 *   node supabase/tests/auth-invite-cycle.mjs
 *
 * Cycle : invitation (email admin) → réception (action_link) →
 * acceptation (verify endpoint) → activation (mot de passe) → connexion
 * (signInWithPassword réel si SUPABASE_TEST_ANON fourni) → rôles/statuts.
 * Refuse explicitement une cible de production. Aucune donnée de prod.
 */
const URL_TEST = process.env.SUPABASE_TEST_URL;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE;
const ANON = process.env.SUPABASE_TEST_ANON;

if (!URL_TEST || !SERVICE) {
  console.error("❌ Variables manquantes : SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE (+ SUPABASE_TEST_ANON pour la connexion réelle).");
  console.error("   Ce script s'exécute uniquement sur un CLONE de test (jamais la production).");
  process.exit(2);
}
if (/motiongraphic\.si/i.test(URL_TEST)) {
  console.error("❌ Refusé : SUPABASE_TEST_URL ressemble à l'instance de production.");
  process.exit(2);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL_TEST, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };

const email = `invite-${Date.now()}@test-clone.local`;
const password = `Cyc!e-${Date.now().toString(36)}`;

async function main() {
  /* 1. Invitation (équivalent POST /api/admin/users/invite). */
  const invite = await admin.auth.inviteUserByEmail(email, {});
  ok(!invite.error, `invitation Auth émise pour ${email} (${invite.error?.message ?? "ok"})`);

  const { data: { users: users1 }, error: listError } = await admin.auth.listUsers({ perPage: 200 });
  ok(!listError, `listUsers page 1 OK (${users1?.length ?? "n"} comptes)`);

  /* 2. Réception : lien d'invitation réel. */
  const link = await admin.auth.generateLink({ type: "invite", email });
  ok(!link.error && Boolean(link.data?.properties?.action_link), "réception du lien d'invitation (action_link)");
  const actionLink = link.data?.properties?.action_link ?? "";

  /* 3. Acceptation : verify endpoint (invite). */
  const tokens = tokensFromLink(actionLink);
  ok(tokens !== null, "acceptation : jeton d'invitation extrait");
  if (tokens?.token) {
    const verify = await fetch(`${URL_TEST}/auth/v1/verify?token=${encodeURIComponent(tokens.token)}&type=invite&redirect_to=${encodeURIComponent(URL_TEST + "/login")}`);
    ok([200, 302].includes(verify.status), `verify endpoint → ${verify.status} (200/302 attendus)`);
  }

  /* 4. Activation : le compte "invité" reçoit un mot de passe. */
  const created = (users1 ?? []).find((u) => u.email === email);
  ok(Boolean(created), "compte Auth créé en état « invité »");
  if (!created) return finish();
  const setPass = await admin.auth.updateUserById(created.id, { password });
  ok(!setPass.error, `activation : mot de passe défini (${setPass.error?.message ?? "ok"})`);

  /* 5. Connexion réelle (si clé anon fournie). */
  if (ANON) {
    const anon = createClient(URL_TEST, ANON, { auth: { persistSession: false } });
    const session = await anon.auth.signInWithPassword({ email, password });
    ok(!session.error, `connexion signInWithPassword → session (${session.error?.message ?? "ok"})`);
    const bad = await anon.auth.signInWithPassword({ email, password: "wrong-password" });
    ok(Boolean(bad.error), "mauvais mot de passe refusé");
  } else {
    console.log("ℹ️  SUPABASE_TEST_ANON absente : connexion réelle non testée.");
  }

  /* 6. Role/status selon l'invitation (serveur = vérité profiles). */
  const { data: profile } = await admin.from("profiles").select("id, role, status").eq("id", created.id).maybeSingle();
  ok(Boolean(profile), "profil créé par handle_new_user à l'invitation");
  ok(profile?.role === "user", `rôle attribué : ${profile?.role} (user attendu pour une invitation user)`);
  ok(profile?.status === "suspended", `statut après invitation : ${profile?.status} (suspended — activation à la 1re connexion validée via /api/auth/consume)`);

  /* 7. Ré-invitation d'un compte ACTIF refusée. */
  const reInvite = await admin.auth.inviteUserByEmail(email, {});
  ok(Boolean(reInvite.error), `invitation re-envoyée sur un compte déjà créé → Auth l'indique (${reInvite.error?.status ?? ""})`);

  /* Nettoyage du clone. */
  await admin.from("profiles").delete().eq("id", created.id);
  await admin.auth.deleteUser(created.id);
  console.log("ℹ️  Nettoyage du compte de test effectué.");
  finish();
}

function tokensFromLink(actionLink) {
  try {
    const url = new URL(actionLink);
    if (url.pathname.endsWith("/verify")) {
      return { token: url.searchParams.get("token") ?? "" };
    }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    return { token: hash.get("token") ?? hash.get("access_token") ?? "" };
  } catch {
    return null;
  }
}

function finish() {
  console.log(failures === 0 ? "\n✅ Cycle d'invitation Auth : OK (clone)." : `\n❌ Échecs : ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error("❌ Erreur :", error); process.exit(1); });
