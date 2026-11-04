/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Contrôle automatique des templates d'animation (CI).
 *
 * Pour chaque template enregistré, dans un vrai navigateur, avec le moteur du
 * Studio (page /dev/template-check, serveur lancé avec TEMPLATE_CHECK=1) :
 *  - enregistrement complet (Studio, builder, cadre, slug réservé, texte par défaut) ;
 *  - repère « out » présent ;
 *  - rien d'important n'est visible avant son entrée (image de départ vs image complète) ;
 *  - aucun élément ne clignote (visible → invisible → visible pendant l'entrée) ;
 *  - quelque chose est visible à l'instant « out » et la sortie le fait disparaître ;
 *  - aucun texte ne déborde du cadre en 16:9, 9:16 et 1:1 ;
 *  - le fond « transparent » est respecté ;
 *  - aucune erreur dans la console.
 * Plus des contrôles du code source (police écrasée, symboles Unicode en guise d'icônes).
 *
 * Lancer : TEMPLATE_CHECK=1 npm start -- -p 3001 &  puis
 *          BASE_URL=http://localhost:3001 npm run test:templates
 * Exceptions justifiées : tests/templates/exceptions.json.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
/** Navigateur : Chrome système si dispo, sinon Chromium Playwright. */
async function launchBrowser(opts = {}) {
  try { return await chromium.launch({ channel: "chrome", headless: true, ...opts }); }
  catch { return await chromium.launch({ headless: true, ...opts }); }
}

const BASE = process.env.BASE_URL || "http://localhost:3001";
const ROOT = process.env.REPO_ROOT || path.join(__dirname, "..", "..");
const EXCEPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "templates", "exceptions.json"), "utf8"));
const allowed = (key, rule) => (EXCEPTIONS[key] || []).includes(rule);

const problems = []; // { key, rule, message }
const fail = (key, rule, message) => {
  if (allowed(key, rule)) return;
  problems.push({ key, rule, message });
};

/* ------------------------- contrôles du code source ------------------------ */
function sourceChecks() {
  const dir = path.join(ROOT, "src", "components", "animations");
  const symbols = /[\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF]|[\u{1F300}-\u{1FAFF}]/u;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      const where = `src/components/animations/${file}:${i + 1}`;
      if (/fontFamily\s*:\s*(config\.)?fontFamily\b/.test(code)) {
        fail(file, "font-override", `${where} — « fontFamily: config.fontFamily » écrase la police de la marque (ControlledAnimation l'applique déjà ; sinon utiliser fontCss()).`);
      }
      if (symbols.test(code)) {
        fail(file, "unicode-icon", `${where} — symbole Unicode/émoji (${code.match(symbols)[0]}) : il s'affiche vide dans le Chromium du rendu MP4. Utiliser un SVG.`);
      }
    });
  }
}

/* ------------------------------ images (PNG) ------------------------------- */
const decode = (buf) => PNG.sync.read(buf);
/** Part des pixels qui diffèrent nettement entre deux images de même taille. */
function inkBetween(a, b) {
  let n = 0;
  const total = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 28) n++;
  }
  return n / total;
}

/** i < j < k : visible, puis invisible, puis de nouveau visible. */
function flickers(series) {
  let seenVisible = -1;
  let hiddenAfter = -1;
  for (let t = 0; t < series.length; t++) {
    const o = series[t];
    if (o > 0.6) {
      if (hiddenAfter >= 0) return { visible: seenVisible, hidden: hiddenAfter, again: t };
      if (seenVisible < 0) seenVisible = t;
    } else if (o < 0.15 && seenVisible >= 0 && hiddenAfter < 0) {
      hiddenAfter = t;
    }
  }
  return null;
}

(async () => {
  sourceChecks();

  const browser = await launchBrowser({});
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  let consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });

  const res = await page.goto(`${BASE}/dev/template-check`, { waitUntil: "networkidle" });
  if (!res || res.status() !== 200) {
    console.error(`❌ /dev/template-check indisponible (HTTP ${res ? res.status() : "?"}) : lancer le serveur avec TEMPLATE_CHECK=1.`);
    process.exit(1);
  }
  await page.waitForFunction(() => window.__tc && window.__tc.ready, null, { timeout: 30000 });
  const list = await page.evaluate(() => window.__tc.list());
  const stage = page.locator("[data-tc-stage]");
  const shot = async () => decode(await stage.screenshot({ type: "png" }));
  const summary = [];

  for (const t of list) {
    const key = t.key;
    const before = problems.length;
    consoleErrors = [];

    /* ---- templates sandbox (contrat renderAt) : déterminisme ---- */
    if (t.kind === "sandbox") {
      if (!t.inStudio) fail(key, "not-in-studio", "code publié mais absent du registre Studio (registerCustomStudioTemplates).");
      if (!t.compatible) fail(key, "sandbox-incompatible", "contrat __MGS_TIMELINE__/renderAt non déterministe (voir capacités admin).");

      await page.evaluate(([k]) => window.__tc.load(k, "16:9", false), [key]);
      await page.waitForTimeout(400); // prêt iframe (mgsi:ready)
      const seek = async (x) => { await page.evaluate((v) => window.__tc.seek(v), x); };
      await page.evaluate((x) => window.__tc.seek(x), 0.01);
      await page.waitForTimeout(250);
      await seek(1.2); const fA1 = await shot();
      await seek(0.3); const fB = await shot();
      await seek(1.2); const fA2 = await shot();
      const detA = inkBetween(fA1, fA2);
      const detB = inkBetween(fA1, fB);
      if (detA > 0.004) fail(key, "sandbox-nondeterministic", `seek(1.2) ne redonne pas la même image (écart ${(detA * 100).toFixed(2)} %) : pas de renderAt déterministe.`);
      if (detB <= 0.01) fail(key, "sandbox-static", "seek(0.3) identique à seek(1.2) : la durée/timeline n'est pas appliquée.");
      // formats : le cadre produit une image exploitable en 9:16 et 1:1
      for (const format of ["9:16", "1:1"]) {
        await page.evaluate(([k, f]) => window.__tc.load(k, f, false), [key, format]);
        await page.waitForTimeout(250);
        await page.evaluate((x) => window.__tc.seek(x), 1.2);
        const fX = await shot();
        if (fX.length < 500) fail(key, "sandbox-format", `en ${format}, l'image sandboxée est vide.`);
      }
      if (consoleErrors.length) fail(key, "console", `erreurs dans la console : ${consoleErrors.slice(0, 2).join(" | ")}`);
      summary.push({ key, ok: problems.length === before, note: `sandbox déterministe (écart ${detA ? (detA * 100).toFixed(3) : "0"} %, mouvement ${detB ? (detB * 100).toFixed(2) : "0"} %)` });
      continue;
    }

    // Enregistrement
    if (!t.inStudio) fail(key, "not-in-studio", "absent de STUDIO_TEMPLATES (src/lib/studio/template-registry.ts).");
    if (!t.hasBuilder) fail(key, "no-builder", "aucun builder dans ANIMATION_BUILDERS (src/lib/animations/builders.ts).");
    if (!t.hasFrame) fail(key, "no-frame", "absent de STUDIO_FRAMES (src/components/studio/ControlledAnimation.tsx).");
    if (!t.reserved) fail(key, "not-reserved", "slug absent de RESERVED_SLUGS (src/lib/templates/custom-model.ts).");
    if (/\\n/.test(t.defaultText)) fail(key, "literal-newline", "le texte par défaut contient « \\n » littéral : écrire \"\\n\" (vrai retour à la ligne) dans registry.ts.");

    if (!t.hasBuilder || !t.hasFrame || allowed(key, "skip-dynamic")) {
      summary.push({ key, ok: problems.length === before, note: "contrôles visuels non applicables" });
      continue;
    }

    // Timeline
    const info = await page.evaluate(([k]) => window.__tc.load(k, "16:9", false), [key]);
    if (info.error) {
      fail(key, "build", `construction impossible : ${info.error}`);
      summary.push({ key, ok: false });
      continue;
    }
    const total = info.total;
    const out = info.out;
    if (out === null) fail(key, "no-out-label", `pas de repère « out » (tl.addLabel("out") au début de la sortie) — indispensable aux modes fit/hold du Studio.`);
    else if (!(out > 0 && out < total)) fail(key, "no-out-label", `repère « out » à ${out.toFixed(2)} s hors de la timeline (0–${total.toFixed(2)} s).`);
    const outAt = out !== null && out > 0 && out < total ? out : total * 0.6;

    // Clignotement : opacité effective de chaque élément, image par image pendant l'entrée.
    const n = Math.max(2, Math.min(150, Math.round(outAt * 30)));
    const times = Array.from({ length: n }, (_, i) => (outAt * i) / (n - 1));
    const series = await page.evaluate((ts) => window.__tc.sampleOpacity(ts), times);
    const flick = [];
    for (const s of series) {
      const f = flickers(s.o);
      if (f) flick.push(`${s.label} (visible à ${times[f.visible].toFixed(2)} s, disparaît à ${times[f.hidden].toFixed(2)} s, revient à ${times[f.again].toFixed(2)} s)`);
    }
    if (flick.length) {
      fail(key, "flicker", `${flick.length} élément(s) clignotent pendant l'entrée — souvent « immediateRender: false » sur un fromTo d'entrée : ${flick.slice(0, 3).join(" ; ")}`);
    }

    // Images : début, état complet (out), fin.
    await page.evaluate((x) => window.__tc.seek(x), 1 / 30);
    const fStart = await shot();
    await page.evaluate((x) => window.__tc.seek(x), outAt);
    const fOut = await shot();
    await page.evaluate((x) => window.__tc.seek(x), total);
    const fEnd = await shot();
    const inkOut = inkBetween(fOut, fEnd);
    const inkStart = inkBetween(fStart, fEnd);
    if (inkOut < 0.002) {
      fail(key, "empty-or-no-exit", `à l'instant « out » (${outAt.toFixed(2)} s), l'image est identique à la fin : template vide, ou sortie qui ne fait rien disparaître.`);
    } else if (inkStart / inkOut > 0.5) {
      fail(key, "visible-at-start", `${Math.round((inkStart / inkOut) * 100)} % du contenu complet est déjà visible à 0,03 s : l'entrée ne part pas d'un état vide (vérifier les fromTo et immediateRender).`);
    }
    fs.mkdirSync(path.join(ROOT, "tests", "templates", "out"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "tests", "templates", "out", `${key}-out.png`), PNG.sync.write(fOut));

    // Débordements dans les trois formats, à l'état complet.
    for (const format of ["16:9", "9:16", "1:1"]) {
      const inf = await page.evaluate(([k, f]) => window.__tc.load(k, f, false), [key, format]);
      if (inf.error) continue;
      await page.evaluate((x) => window.__tc.seek(x), outAt);
      const over = await page.evaluate(() => window.__tc.overflow());
      if (over.length) fail(key, "overflow", `en ${format}, ${over.length} texte(s) sortent du cadre : ${over.slice(0, 3).map((o) => `${o.label} (+${o.dx}px / +${o.dy}px)`).join(" ; ")}`);
    }

    // Fond transparent.
    await page.evaluate(([k]) => window.__tc.load(k, "16:9", true), [key]);
    await page.evaluate((x) => window.__tc.seek(x), outAt);
    const cover = await page.evaluate(() => window.__tc.coverage());
    if (cover.length) fail(key, "transparent-ignored", `avec backgroundColor = "transparent", un fond opaque couvre encore le cadre (${cover[0].label}, ${cover[0].area} %).`);

    if (consoleErrors.length) fail(key, "console", `erreurs dans la console : ${consoleErrors.slice(0, 2).join(" | ")}`);

    summary.push({ key, ok: problems.length === before, note: `durée ${total.toFixed(2)} s, out ${out === null ? "—" : out.toFixed(2) + " s"}, contenu visible au départ ${inkOut ? Math.round((inkStart / inkOut) * 100) : 0} %` });
  }
  await browser.close();

  // Problèmes de code source (fichiers) rattachés à leur fichier.
  const sourceProblems = problems.filter((p) => p.key.endsWith(".tsx"));

  console.log("\nContrôle des templates\n");
  for (const s of summary) {
    console.log(`${s.ok ? "✅" : "❌"} ${s.key}${s.note ? ` — ${s.note}` : ""}`);
    for (const p of problems.filter((x) => x.key === s.key)) console.log(`     • [${p.rule}] ${p.message}`);
  }
  for (const p of sourceProblems) console.log(`❌ ${p.key} — [${p.rule}] ${p.message}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = ["## Contrôle des templates", "", "| Template | Résultat |", "| --- | --- |"];
    for (const s of summary) {
      const ps = problems.filter((x) => x.key === s.key);
      md.push(`| \`${s.key}\` | ${s.ok ? "✅ OK" : "❌ " + ps.map((p) => `**${p.rule}** : ${p.message.replace(/\|/g, "\\|")}`).join("<br>")} |`);
    }
    for (const p of sourceProblems) md.push(`| \`${p.key}\` | ❌ **${p.rule}** : ${p.message.replace(/\|/g, "\\|")} |`);
    md.push("", "Règles et exceptions : `docs/COLLABORATION.md` § 5 et `tests/templates/exceptions.json`.");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
  }

  if (problems.length) {
    console.log(`\n${problems.length} problème(s). Corriger, ou — si c'est voulu — ajouter une exception justifiée dans tests/templates/exceptions.json.`);
    process.exit(1);
  }
  console.log("\nTous les templates passent le contrôle.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
