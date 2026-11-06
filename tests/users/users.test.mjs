/**
 * Tests utilisateurs privés V1 (administration + MCP personnel dormant).
 * Cible : BASE_URL (défaut http://localhost:3000), mode démo ou Supabase.
 *   BASE_URL=http://localhost:3000 npm run test:users
 * (Node ≥ 22.11 avec strip-types pour importer la lib TS du jeton.)
 */
const { createRequire } = await import("node:module");
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const { createHash } = await import("node:crypto");
const { mintUserToken, hashToken, looksLikeUserToken } = await import("../../src/lib/studio/mcp-tokens.ts");
const {
  invitationState, invitationGrantsAccess, canInvite, accountIsActivated, checkAdminChange,
} = await import("../../src/lib/admin/invitation-state.ts");

let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };
const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

async function launchBrowser(options) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (String(error?.message ?? "").includes("Executable doesn't exist")) {
      return chromium.launch({ ...options, channel: "chrome" });
    }
    throw error;
  }
}

async function main() {
  /* ---------------------------------------------------------------- */
  /* 1. Unité : jetons MCP personnels (format + hash, hors activation) */
  /* ---------------------------------------------------------------- */
  {
    const { token, tokenHash } = mintUserToken();
    ok(token.startsWith("mgsi_") && token.length > 40, "jeton personnel au format mgsi_<256 bits>");
    ok(tokenHash === createHash("sha256").update(token).digest("hex"), "empreinte SHA-256 cohérente");
    ok(tokenHash.length === 64 && /^[0-9a-f]+$/.test(tokenHash), "empreinte stockée (64 hex), jamais la valeur claire");
    ok(looksLikeUserToken(token), "looksLikeUserToken accepte le format émis");
    ok(!looksLikeUserToken("mgsi_") && !looksLikeUserToken("Bearer x"), "formats étrangers refusés");
    ok(hashToken(token) === tokenHash, "hashToken stable");
  }

  /* ---------------------------------------------------------------- */
  /* 1bis. Unité : machine d'état invitations + gardes admin           */
  /* ---------------------------------------------------------------- */
  {
    const NOW = Date.parse("2026-11-06T12:00:00Z");
    const pending = { expires_at: "2026-11-20T12:00:00Z", used_at: null, revoked_at: null };
    const expired = { expires_at: "2026-10-01T12:00:00Z", used_at: null, revoked_at: null };
    const revoked = { expires_at: "2026-11-20T12:00:00Z", used_at: null, revoked_at: "2026-11-01T00:00:00Z" };
    const used = { expires_at: "2026-11-20T12:00:00Z", used_at: "2026-11-05T00:00:00Z", revoked_at: null };
    ok(invitationState(pending, NOW) === "pending" && invitationGrantsAccess(pending, NOW), "invitation en attente = accessible");
    ok(invitationState(expired, NOW) === "expired" && !invitationGrantsAccess(expired, NOW), "invitation expirée = refusée");
    ok(invitationState(revoked, NOW) === "revoked" && !invitationGrantsAccess(revoked, NOW), "invitation révoquée = refusée");
    ok(invitationState(used, NOW) === "used" && !invitationGrantsAccess(used, NOW), "invitation utilisée = non re-consommable");
    ok(invitationState(pending, Date.parse("2026-11-21T00:00:00Z")) === "expired", "l'invitation expire à la borne (14 j réellement appliqués)");

    ok(canInvite(null).action === "fresh", "email inconnu → invitation fraîche");
    ok(canInvite({ last_sign_in_at: null, email_confirmed_at: null }).action === "reinvite", "compte invité non activé → ré-invitation");
    ok(canInvite({ last_sign_in_at: "2026-11-05T00:00:00Z", email_confirmed_at: "2026-11-05T00:00:00Z" }).action === "block", "compte actif → refus 409");
    ok(!accountIsActivated({ last_sign_in_at: null, email_confirmed_at: null }), "compte sans session ni confirmation = non activé");

    const guard = (ctx, change) => checkAdminChange(ctx, change);
    const base = { actorId: "admin-1", targetId: "user-1", targetRole: "user", targetStatus: "active", otherActiveAdmins: 1 };
    ok(guard(base, { role: "admin" }).ok, "promotion d'un user autorisée");
    ok(guard(base, { status: "suspended" }).ok, "suspension d'un user autorisée");
    const selfCtx = { actorId: "admin-1", targetId: "admin-1", targetRole: "admin", targetStatus: "active", otherActiveAdmins: 2 };
    ok(guard(selfCtx, { role: "user" }).code === "self-demote", "auto-rétrogradation refusée");
    ok(guard(selfCtx, { status: "suspended" }).code === "self-suspend", "auto-suspension refusée");
    const lastAdmin = { actorId: "admin-1", targetId: "admin-2", targetRole: "admin", targetStatus: "active", otherActiveAdmins: 0 };
    ok(guard(lastAdmin, { role: "user" }).code === "last-admin", "dernier admin : rétrogradation refusée");
    ok(guard(lastAdmin, { status: "suspended" }).code === "last-admin", "dernier admin : suspension refusée");
    ok(guard(lastAdmin, { status: "active" }).ok, "dernier admin : réactivation autorisée");
    ok(guard(base, { role: "boss" }).code === "unknown-role" && guard(base, { status: "paused" }).code === "unknown-status", "valeurs non canoniques refusées");
  }

  /* ---------------------------------------------------------------- */
  /* 2. Pages privées : /admin/users                                   */
  /* ---------------------------------------------------------------- */
  {
    const browser = await launchBrowser({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1024, height: 800 } })).newPage();
    await page.goto(BASE + "/admin/users", { waitUntil: "load" });
    const finalPath = new URL(page.url()).pathname;
    if (DEMO) {
      ok(finalPath === "/login", `/admin/users suivi de la redirection → ${finalPath} (login attendu)`);
    } else {
      ok(["/login", "/admin/users"].includes(finalPath), `/admin/users → ${finalPath} (/login ou la page admin)`);
    }
    await browser.close();
  }

  /* ---------------------------------------------------------------- */
  /* 3. API d'administration : contrôle serveur                         */
  /* ---------------------------------------------------------------- */
  {
    const response = await fetch(BASE + "/api/admin/users", { headers: { "accept": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (DEMO) {
      ok(response.status === 503, "GET /api/admin/users en démo → 503 (administration indisponible)");
      ok(/Supabase|service_role/i.test(String((payload.errors ?? []).join(" "))), "message honnête : service_role non configuré");
    } else {
      ok(response.status === 401 || response.status === 403, `sans session → ${response.status} (401/403 attendus)`);
    }
    const invite = await fetch(BASE + "/api/admin/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "intrus@exemple.com", role: "admin" }),
    });
    ok([401, 403, 503].includes(invite.status), `POST /invite sans session → ${invite.status} (jamais 200)`);
    if (invite.status === 503) {
      const payload = await invite.json().catch(() => ({}));
      ok(/indisponible/i.test(String((payload.errors ?? []).join(" "))), "invitation refusée avant tout effet");
    }
    const patch = await fetch(BASE + "/api/admin/users/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });
    ok([400, 401, 403, 503].includes(patch.status), `PATCH utilisateur sans session → ${patch.status}`);

    /* Renvoi d'invitation (reinvite) : même contrôle serveur. */
    const reinvite = await fetch(BASE + "/api/admin/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "deja-invitée@exemple.com", role: "admin" }),
    });
    ok([401, 403, 503].includes(reinvite.status), `ré-invitation sans session admin → ${reinvite.status}`);

    /* Garde d'acceptation (première connexion) : la route doit refuser un visiteur sans session même en démo. */
    const consume = await fetch(BASE + "/api/auth/consume", { method: "POST" });
    ok([401, 503].includes(consume.status), `POST /api/auth/consume sans session → ${consume.status} (401/503)`);

    /* MCP personnel : architecture prête, désactivée par défaut. */
    const mint = await fetch(BASE + "/api/settings/mcp-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const mintPayload = await mint.json().catch(() => ({}));
    const message = String((mintPayload.errors ?? []).join(" "));
    ok(mint.status === 503 && /MCP_USER_TOKENS/.test(message), `émission jeton MCP perso → ${mint.status} + drapeau cité (dormant)`);
  }

  console.log(failures === 0 ? "\n✅ Tous les tests utilisateurs passent." : `\n❌ Échecs : ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error("❌ Erreur de test :", error); process.exit(1); });
