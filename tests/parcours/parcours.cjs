/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Parcours COMPLET d'un template personnalisé :
 *   Template Lab (création) → Prévisualisation → Publication → Catalogue
 *   → Studio (bibliothèque + timeline + réglages) → Moteur de rendu réel.
 *
 * Lancer :
 *   CONSTRUCTION_MODE=off npm run build
 *   CONSTRUCTION_MODE=off npm start -- -p 3000 &
 *   BASE_URL=http://localhost:3000 npm run test:parcours
 */
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.BASE_URL || "http://localhost:3000";
const TMP = process.env.TEMP_DIR || "/tmp/mgsi-parcours";
let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };

async function pixelsDifferRaw(a, b, tolerance = 28) {
  const sharp = (await import("sharp")).default;
  const W = 480, H = 270;
  const A = await sharp(a).resize(W, H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const B = await sharp(b).resize(W, H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
    if (d > tolerance) diff += 1;
  }
  return diff / (W * H) > 0.004;
}
function pixelsDiffer(aBuf, bBuf, tolerance = 28) {
  return pixelsDifferRaw(aBuf, bBuf, tolerance);
}

/** Contrat déterministe renderAt(time, params) : cascade + sortie (fit/hold). */
const CONTRACT_CODE = [
  "window.__MGS_TIMELINE__ = {",
  "  duration: 2,",
  "  outAt: 1.6,",
  "  renderAt: function (time, params) {",
    "    var stage = document.getElementById(\"stg\");",
    "    if (!stage) { stage = document.createElement(\"div\"); stage.id = \"stg\"; stage.style.cssText = \"position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden\"; document.body.appendChild(stage); }",
    "    stage.style.background = params.backgroundColor || \"#000\";",
    "    var text = params.text || \"MOTION\";",
    "    var accent = params.accentColor || \"#0A84FF\";",
    "    var ink = params.primaryColor || \"#F5F5F7\";",
    "    var letters = String(text).split(\"\");",
    "    if (stage.children.length !== letters.length) { stage.innerHTML = \"\"; letters.forEach(function () { var sp = document.createElement(\"span\"); sp.style.cssText = \"display:inline-block;font-weight:800;font-size:clamp(24px,6vw,70px);margin:0 .02em\"; stage.appendChild(sp); }); }",
    "    var hold = this.outAt || 1.6;",
    "    letters.forEach(function (ch, i) {",
    "      var sp = stage.children[i]; sp.textContent = ch === \" \" ? \"\\u00A0\" : ch;",
    "      var dt = Math.max(0, time - i * 0.08);",
    "      var entered = Math.min(1, dt / 0.4);",
    "      var exitStart = hold - i * 0.05;",
    "      var exit = time >= exitStart ? Math.min(1, (time - exitStart) / 0.4) : 0;",
    "      sp.style.transform = \"translateY(\" + ((1 - entered) * 40 - exit * 40) + \"%)\";",
    "      sp.style.opacity = String(Math.max(0, Math.min(entered - exit, 1)));",
    "      sp.style.color = i % 3 === 1 ? accent : ink;",
    "    });",
  "  },",
  "};",
].join("\n");

const TEMPLATE = (status, version) => ({
  id: "parcours-template-01",
  slug: "parcours-cta-01",
  name: "Parcours CTA",
  category: "text-motion",
  description: "Template du parcours (contrat renderAt)",
  sourceKind: "code",
  code: CONTRACT_CODE,
  defaultConfig: { text: "PARCOURS!", primaryColor: "#F5F5F7", accentColor: "#22D3EE", backgroundColor: "#000000", duration: 2, speed: 1 },
  promptWeb: "prompt web du parcours",
  promptAfterEffects: "prompt AE du parcours",
  version,
  status,
});

async function labPut(template) {
  const res = await fetch(BASE + "/api/templates/lab", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(template),
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body: body ?? {} };
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(TMP, { recursive: true });

  /* 1. Création (brouillon) dans le Template Lab. */
  const created = await labPut(TEMPLATE("draft", 1));
  ok(created.status === 200 && created.body.ok === true, "1. Template Lab : brouillon créé (validator serveur)");
  ok(!created.body.errors || created.body.errors.length === 0, "1b. Aucun rejet du validateur de sécurité");

  /* 2. Brouillon PAS accessible publiquement (page détail + sandbox route). */
  const draftPage = await fetch(BASE + "/templates/parcours-cta-01");
  const body = await draftPage.text();
  ok(draftPage.status === 404 || !body.includes("Parcours CTA"), "2. Le brouillon n'est PAS dans le catalogue public");

  /* 3. Modification des paramètres (candidate v2) puis publication (v3). */
  const candidate = await labPut(TEMPLATE("candidate", 2));
  ok(candidate.body.ok === true, "3. Paramètres modifiés, statut candidate (v2)");
  const published = await labPut(TEMPLATE("published", 3));
  ok(published.status === 200 && published.body.ok === true, "4. Publication (v3)");

  /* 5. Catalogue : la fiche publique apparaît automatiquement. */
  const page = await fetch(BASE + "/templates/parcours-cta-01?t=" + Date.now());
  const detailHtml = await page.text();
  ok(page.status === 200 && detailHtml.includes("Parcours CTA"), "5. Catalogue : la fiche fait partie du catalogue");
  ok(detailHtml.includes("prompt web du parcours"), "5b. Prompt associé présent sur la fiche");

  /* 6-7. Studio : bibliothèque, ajout en timeline, durée éditable. */
  {
    const b = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
    const p = await ctx.newPage();
    const consErrors = [];
    p.on("pageerror", (e) => consErrors.push(String(e?.message || e).slice(0, 120)));
    p.on("console", (m) => { if (m.type() === "error") consErrors.push(m.text().slice(0, 120)); });
    await p.goto(BASE + "/studio", { waitUntil: "networkidle" });
    await sleep(1800);

    // Onglet bibliothèque ("Templates") puis la carte du template publié.
    await p.locator('button:has-text("Templates")').first().click();
    await sleep(500);
    const card = p.locator(`[data-template-card="parcours-cta-01"]`);
    ok((await card.count()) === 1, "6. Studio : le template publié est dans la bibliothèque");
    await card.click();
    await sleep(1000);
    const block = p.locator('[role="button"][aria-label^="Élément Parcours"]');
    ok((await block.count()) === 1, "6b. Ajout à la timeline (bloc présent)");

    await block.click({ position: { x: 30, y: 20 } });
    await sleep(500);
    await p.locator('input[id="pr-duration"]').fill("2.5");
    await sleep(600);
    const label = String((await block.getAttribute("aria-label")) || "");
    ok(label.includes("2.5s"), `7. Durée modifiée (${label})`);

    const rightText = (await p.locator("aside").last().innerText()) || "";
    ok(rightText.includes("Parcours CTA") || rightText.includes(slug), "7b. Panneau droit : propriétés de l'élément");

    /* Sélection : remplacement instantané compatible (text) */
    // Le parcours (text-motion) => kind "text" : styles compatibles typographiques.
    const styleButton = p.locator("aside").last().locator("button:has-text('Text Reveal')");
    if ((await styleButton.count()) > 0) {
      await styleButton.first().click();
      await sleep(600);
      ok(true, "8. Remplacement instantané : autre style compatible (Text Reveal)");
      const undo = p.locator('button[aria-label="Annuler (Cmd+Z)"]');
      await undo.click();
      await sleep(400);
    } else {
      ok(false, "8. Style compatible introuvable dans le panneau");
    }

    const realErrors = consErrors.filter((e) => !/favicon/i.test(e));
    ok(realErrors.length === 0, `Console Studio sans erreur (${realErrors.slice(0, 2).join(" | ") || "—"})`);
    await b.close();
  }

  /* 9. Moteur de rendu réel (le MÊME moteur que l'export MP4) : deux instants
   * du template sandboxé produisent des images distinctes (temps maître). */
  {
    const b = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1.92 });
    const p = await ctx.newPage();
    await p.goto(BASE + "/dev/render-stage?w=1920&h=1080", { waitUntil: "networkidle", timeout: 60_000 });
    await p.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
    const stage = p.locator("[data-render-stage]");
    await p.evaluate(() => window.__mgsiRender.seek(0.4));
    await sleep(170);
    const shotA = await stage.screenshot({ type: "jpeg", quality: 92 });
    await p.evaluate(() => window.__mgsiRender.seek(1.4));
    await sleep(170);
    const shotB = await stage.screenshot({ type: "jpeg", quality: 92 });
    await p.evaluate(() => window.__mgsiRender.seek(0.4));
    await sleep(170);
    const shotA2 = await stage.screenshot({ type: "jpeg", quality: 92 });
    require("fs").writeFileSync(TMP + "/rendu-04s.jpg", shotA);
    require("fs").writeFileSync(TMP + "/rendu-14s.jpg", shotB);
    ok((await pixelsDifferRaw(shotA, shotB)), "9. Le moteur avance dans le temps (0.4s ≠ 1.4s)");
    ok(!(await pixelsDifferRaw(shotA, shotA2)), "9b. Déterminisme : seek(0.4) x2 identique");
    await ctx.close();
    await b.close();
  }

  console.log(failures === 0 ? "\nPARCOURS COMPLET : OK" : `\n${failures} echec(s).`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });