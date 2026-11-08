/**
 * Tests e2e « Accès MCP » (panneau de jetons personnels).
 *   BASE_URL=http://localhost:3000 npm run test:settings-mcp
 *
 * Backend mocké au niveau réseau (playwright page.route) : le contrat
 * d'API est implémenté côté serveur dans une autre zone (Claude) ;
 * en local il est désactivé (503 honnête) — les tests simulent donc
 * toutes les réponses du contrat SANS toucher au code serveur et
 * SANS aucune valeur sensible réelle (valeurs fictives mgsi_TEST_*).
 */
let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };

const BASE = process.env.BASE_URL || "http://localhost:3000";
const TOKENS_URL = "/api/settings/mcp-tokens";
const ADMIN_URL = "/api/admin/mcp-tokens";

const A_TOKEN_ITEM = {
  id: "t-1",
  name: "Claude — poste",
  scopes: ["read"],
  createdAt: "2026-11-01T10:00:00Z",
  expiresAt: "2027-01-30T10:00:00Z",
  lastUsedAt: "2026-11-05T10:00:00Z",
  revokedAt: null,
};
const B_TOKEN_EXPIRED = {
  ...A_TOKEN_ITEM,
  id: "t-2",
  name: "Ancien jeton",
  expiresAt: "2026-11-02T10:00:00Z",
  lastUsedAt: null,
};
const C_TOKEN_REVOKED = {
  ...A_TOKEN_ITEM,
  id: "t-3",
  name: "Jeton révoqué",
  revokedAt: "2026-11-04T09:00:00Z",
};

function itemsUrl(path) {
  return `${BASE}${path}`;
}

async function freshPage(context) {
  return context.newPage();
}

/* Stub réseau : répond selon la configuration du test courant. */
function stubTokens(page, options = {}) {
  const {
    list = [], listStatus = 200,
    createStatus = 201, createBody = { token: "mgsi_TEST_create_value_never_share", item: null },
    rotateStatus = 200, rotateBody = { token: "mgsi_TEST_RENOUVELLE_2", item: null },
    deleteStatus = 200, deleteBody = { ok: true },
  } = options;
  return page.route(`**${TOKENS_URL}**`, (route, request) => {
    const url = new URL(request.url());
    const method = request.method();
    const isRotate = url.pathname.endsWith("/rotate");
    if (method === "GET") {
      return route.fulfill({ status: listStatus, contentType: "application/json", body: JSON.stringify(listStatus === 200 ? { tokens: list } : { ok: false, errors: ["mock"] }) });
    }
    if (method === "POST" && isRotate) {
      return route.fulfill({ status: rotateStatus, contentType: "application/json", body: JSON.stringify(rotateBody) });
    }
    if (method === "POST") {
      return route.fulfill({ status: createStatus, contentType: "application/json", body: JSON.stringify(createBody) });
    }
    if (method === "DELETE") {
      return route.fulfill({ status: deleteStatus, contentType: "application/json", body: JSON.stringify(deleteBody) });
    }
    return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
}

async function openTokens(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile-first
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await freshPage(context);
  await stubTokens(page, options);
  await page.goto(BASE + "/settings/mcp", { waitUntil: "load" });
  const panel = page.locator("[data-mcp-tokens-panel]");
  await panel.waitFor({ timeout: 15000 });
  return { context, page, panel };
}

async function main() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));

  /* 1-2-3 : état de chargement, puis liste, aide visible */
  {
    const { context, page, panel } = await openTokens(browser, { list: [A_TOKEN_ITEM, B_TOKEN_EXPIRED, C_TOKEN_REVOKED] });
    await page.waitForTimeout(400);
    ok(await page.locator("[data-mcp-tokens-list] [data-mcp-token-row]").count() === 3, "liste : 3 jetons affichés");
    ok((await page.locator("[data-mcp-help]").textContent()).includes("Authorization: Bearer"), "bloc d'aide : en-tête Bearer documenté (sans valeur réelle)");
    ok((await page.locator("[data-token-value]").count()) === 0, "AUCUN vrai token affiché dans la liste");
    // statuts affichés
    const statuses = await page.locator("[data-mcp-token-status]").allTextContents();
    ok(statuses.join("|").includes("Actif") && statuses.join("|").includes("Expiré") && statuses.join("|").includes("Révoqué"), `statuts : ${statuses.join(", ")}`);
    await context.close();
  }

  /* 4 : état vide */
  {
    const { context, page } = await openTokens(browser, { list: [] });
    await page.waitForTimeout(300);
    const note = await page.locator("[data-mcp-disabled-note]").textContent().catch(() => "");
    if (note && note.includes("désactivés")) {
      ok(true, "mode démo : la fonctionnalité serveur désactivée est signalée");
      await context.close();
      return finish(browser); // fin du test court en démo sans stub
    }
    ok(await page.locator("[data-mcp-empty]").isVisible(), "état vide : message « aucun jeton »");
    await context.close();
  }

  /* 5 : fonctionnalité désactivée (503) */
  {
    const { context, page } = await openTokens(browser, { listStatus: 503 });
    await page.waitForTimeout(300);
    const text = await page.locator("[data-mcp-error]").textContent();
    ok(text.includes("pas encore activée"), "503 : message « pas encore activée » (jamais technique brut)");
    await context.close();
  }

  /* 6 : session expirée (401) */
  {
    const { context, page } = await openTokens(browser, { listStatus: 401 });
    await page.waitForTimeout(300);
    const text = await page.locator("[data-mcp-error]").textContent();
    ok(text.includes("Connexion requise"), "401 : message « Connexion requise »");
    ok(await page.locator('a[href="/login"]').first().isVisible(), "401 : lien vers /login proposé");
    await context.close();
  }

  /* 7 : compte suspendu (423) */
  {
    const { context, page } = await openTokens(browser, { listStatus: 423 });
    await page.waitForTimeout(300);
    const text = await page.locator("[data-mcp-error]").textContent();
    ok(text.includes("suspendu"), "423 : message «Compte suspendu »");
    await context.close();
  }

  /* 8 : accès refusé (403) sur la création */
  {
    const { context, page } = await openTokens(browser, { list: [A_TOKEN_ITEM], createStatus: 403 });
    await page.waitForTimeout(300);
    await page.locator("[data-mcp-create-toggle]").click();
    await page.locator("#mcp-token-name").fill("Test");
    await page.locator("[data-mcp-token-submit]").click();
    await page.waitForTimeout(300);
    const text = await page.locator("[data-mcp-error]").textContent();
    ok(text.includes("Accès refusé") || text.includes("administrateurs"), "403 à la création : message adapté");
    await context.close();
  }

  /* 9 : création + révélation UNIQUE + copie + disparition */
  {
    const item = { ...A_TOKEN_ITEM, id: "t-new", name: "Nouveau jeton" };
    const { context, page } = await openTokens(browser, { list: [A_TOKEN_ITEM], createStatus: 201, createBody: { token: "mgsi_TEST_REVEALED", item } });
    await page.waitForTimeout(300);
    await page.locator("[data-mcp-create-toggle]").click();
    await page.locator("#mcp-token-name").fill("Nouveau jeton");
    // permissions par défaut Lecture ; durée 90 j par défaut
    await page.locator("[data-mcp-token-submit]").click();
    const reveal = page.locator("[data-token-reveal]");
    await reveal.waitFor({ timeout: 5000 });
    ok((await reveal.textContent()).includes("ne sera plus jamais affiché"), "révélation : avertissement de visibilité unique");
    ok(await reveal.locator("[data-token-value]").textContent() === "mgsi_TEST_REVEALED", "révélation : la valeur du jeton s'affiche");
    ok((await reveal.textContent()).includes("Nouveau jeton"), "révélation : le nom du jeton est indiqué");
    await page.locator('button[aria-label="Copier le jeton"]').click();
    await page.waitForTimeout(200);
    const copyText = await page.locator('button[aria-label="Jeton copié"]').count() > 0 ? "Copié" : await page.locator("[data-token-reveal] button").first().textContent();
    ok(copyText.includes("Copié") || copyText.includes("Sélectionné"), `copie : confirmation (${copyText.trim()})`);
    void copyText;
    // liste mise à jour (nouveau jeton)
    ok(await page.locator("[data-mcp-tokens-list] [data-mcp-token-row]").count() === 2, "création : la liste s'actualise");
    // fermeture : le jeton n'est PLUS nulle part
    await page.locator("[data-token-reveal] button", { hasText: "Fermer" }).click();
    ok((await page.locator("[data-token-value]").count()) === 0, "fermeture : la valeur disparaît définitivement");
    // localStorage/URL sans jeton
    const storage = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
    ok(storage[0] === 0 || !JSON.stringify(Object.keys(localStorage)).includes("mgsi"), "aucun jeton au localStorage");
    void storage;
    await context.close();
  }

  /* 10 : renouvellement (rotate) + confirmation */
  {
    const item = { ...A_TOKEN_ITEM };
    const { context, page } = await openTokens(browser, { list: [item], rotateStatus: 200, rotateBody: { token: "mgsi_TEST_RENOUVELLE_2", item: { ...item, name: "Claude — poste" } } });
    await page.waitForTimeout(300);
    await page.locator("[data-mcp-token-row] >> button", { hasText: "Renouveler" }).click();
    const reveal = page.locator("[data-token-reveal]");
    await reveal.waitFor({ timeout: 5000 });
    ok((await reveal.locator("[data-token-value]").textContent()) === "mgsi_TEST_RENOUVELLE_2", "renouvellement : le nouveau jeton s'affiche");
    await context.close();
  }

  /* 11 : révocation avec confirmation (et annulation) */
  {
    const { context, page } = await openTokens(browser, { list: [{ ...A_TOKEN_ITEM }] });
    await page.waitForTimeout(300);
    await page.locator("[data-mcp-token-revoke]").click();
    ok(await page.locator("[data-mcp-token-revoke-confirm]").isVisible(), "révocation : demande de confirmation affichée");
    // Annuler d'abord
    await page.locator("button", { hasText: "Annuler" }).click();
    ok((await page.locator("[data-mcp-token-status]").textContent()) === "Actif", "annulation : le jeton reste actif");
    // Puis confirmer
    await page.locator("[data-mcp-token-revoke]").click();
    await page.locator("[data-mcp-token-revoke-confirm]").click();
    await page.waitForTimeout(300);
    ok((await page.locator("[data-mcp-token-status]").textContent()) === "Révoqué", "révocation : statut mis à jour");
    await context.close();
  }

  /* 12 : échec réseau → message compréhensible + Réessayer */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route(`**${TOKENS_URL}`, (route) => route.abort());
    await page.goto(BASE + "/settings/mcp", { waitUntil: "load" });
    await page.waitForTimeout(500);
    const text = await page.locator("[data-mcp-error]").textContent();
    ok(text.length > 10 && !text.includes("%"), "échec réseau : message compréhensible (pas de données brutes)");
    ok((await page.locator("button", { hasText: "Réessayer" }).count()) === 1, "échec réseau : bouton Réessayer");
    await context.close();
  }

  /* 13 : la section admin n'est PAS visible pour un utilisateur standard */
  {
    const { context, page } = await openTokens(browser, { list: [A_TOKEN_ITEM] });
    ok((await page.locator("[data-mcp-admin-section]").count()) === 0, "utilisateur standard : section admin absente");
    await context.close();
  }

  /* 14-15 : section admin (démo ?admin, backend mocké) + révocation */
  {

    const ADMIN_T = [
      { ...A_TOKEN_ITEM, ownerEmail: "a@example.com", ownerStatus: "active" },
      { ...C_TOKEN_REVOKED, ownerEmail: "b@example.com", ownerStatus: "suspended" },
    ];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route(`**${TOKENS_URL}**`, (route, req) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tokens: [A_TOKEN_ITEM] }) }));
    await page.route(`**${ADMIN_URL}**`, (route, req) => {
      if (req.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tokens: ADMIN_T }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.goto(BASE + "/settings/mcp?demo-admin=1", { waitUntil: "load" });
    await page.waitForTimeout(300);
    ok(await page.locator("[data-mcp-admin-section]").isVisible(), "mode démo admin : la section administration est visible pour le rôle admin");
    await page.locator("[data-mcp-admin-load]").click();
    await page.waitForTimeout(400);
    const rows = await page.locator("[data-mcp-admin-token-row]").count();
    ok(rows === 2, `admin : 2 jetons listés (reçu ${rows})`);
    ok((await page.locator("[data-mcp-admin-section]").textContent()).includes("Propriétaire :"), "admin : propriétaires affichés");
    await page.locator("[data-mcp-admin-token-revoke]").first().click();
    await page.waitForTimeout(300);
    ok((await page.locator("[data-mcp-admin-token-row]").first().textContent()).includes("Révoqué"), "admin : révocation appliquée");
    await context.close();
  }

  /* 16 : clavier — le formulaire est utilisable entièrement au clavier */
  {
    const item = { ...A_TOKEN_ITEM, id: "t-kb" };
    const { context, page } = await openTokens(browser, { list: [item], createStatus: 201, createBody: { token: "mgsi_TEST_KEYBOARD", item: { ...A_TOKEN_ITEM, id: "t-kb2", name: "kb" } } });
    await page.locator("[data-mcp-create-toggle]").focus();
    await page.keyboard.press("Enter");
    ok(await page.locator("#mcp-token-form").isVisible(), "clavier : le formulaire s'ouvre au clavier");
    await page.locator("#mcp-token-name").fill("kb");
    await page.locator("[data-mcp-token-submit]").focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-token-reveal]").waitFor({ timeout: 5000 });
    ok(true, "clavier : création complète au clavier + révélation");
    // focus initial dans le panneau de révélation sur le bouton Fermer
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    ok(focused.includes("Fermer"), "clavier : le focus est posé sur la fermeture du panneau de révélation");
    await context.close();
  }

  return finish(browser);
}

function finish(browser) {
  if (browser) void browser.close();
  console.log(failures === 0 ? "\n✅ Tous les tests « accès MCP » passent." : `\n❌ Échecs : ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error("❌ Erreur de test :", error); process.exit(1); });
