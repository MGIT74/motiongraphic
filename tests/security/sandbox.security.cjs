/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests de sécurité du runtime sandboxé (navigateur réel via Playwright).
 * Lancer : CONSTRUCTION_MODE=off npm run build && CONSTRUCTION_MODE=off npm start -p 3000 &
 *          BASE_URL=http://localhost:3000 npm run test:security
 *
 * Vérifie, sur une page /dev/sandbox-check (TEMPLATE_CHECK=1, hors prod) :
 * 1. le runtime chargé rend via renderAt(time) (READY timeline + SEEK acquitté) ;
 * 2. DÉTERMINISME : seek(A) puis seek(B) puis seek(A) -> image identique (octets) ;
 * 3. réseau interdit (fetch bloqué par la CSP dans l'iframe) ;
 * 4. stockage interdit (localStorage -> SecurityError dans l'iframe) ;
 * 5. contexte parent inaccessible (window.top document = opaque) ;
 * 6. messages hostiles (session bidon) ignorés (metrics.ignored++) ;
 * 7. payload SEEK invalide (t textuel, id manquant) ignoré ;
 * 8. eval() neutralisé dans l'iframe (CSP script-src inline only? eval interdit).
 */
const { chromium } = require("playwright");
/** Navigateur : Chrome système si dispo, sinon Chromium Playwright. */
async function launchBrowser(opts = {}) {
  try { return await chromium.launch({ channel: "chrome", headless: true, ...opts }); }
  catch { return await chromium.launch({ headless: true, ...opts }); }
}
const BASE = process.env.BASE_URL || "http://localhost:3000";
(async () => {
  const b = await launchBrowser({});
  const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await ctx.newPage();
  const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) process.exitCode = 1; };

  await p.goto(BASE + "/dev/sandbox-check", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__mgsSandboxCheck?.ready === true, undefined, { timeout: 30000 });

  const host = () => p.evaluate(() => ({
    ready: window.__mgsSandboxCheck.ready,
    mode: window.__mgsSandboxCheck.mode,
    incompatible: window.__mgsSandboxCheck.incompatible,
  }));

  let state = await host();
  ok(state.mode === "timeline", `Contrat détecté : mode « ${state.mode} »`);
  ok((state.incompatible || []).length === 0, "Incompatibilité : " + state.incompatible.join(", "));

  // 2) DÉTERMINISME : seek(A) -> capture, seek(B) -> capture, seek(A) -> capture
  const snap = async (t) => { await p.evaluate((v) => window.__mgsSandboxCheck.seek(v), t); await p.waitForTimeout(120); const stage = await p.locator("[data-sandbox-stage]").boundingBox(); return p.screenshot({ clip: stage }); };
  const bufA1 = await snap(1.2);
  const bufB = await snap(0.3);
  const bufA2 = await snap(1.2);
  ok(bufA1.length > 1000 && bufB.length > 1000, "Captures produites");
  ok(bufA1.equals(bufA2), "Déterminisme : seek(1.2) -> images identiques");
  ok(!bufA1.equals(bufB), "Le temps change bien l'image (1.2 ≠ 0.3)");

  // 6/7) messages hostiles : session bidon / formes invalides
  await p.evaluate(() => window.__mgsSandboxCheck.sendHostile());
  await p.waitForTimeout(300);
  const metrics = await p.evaluate(() => window.__mgsSandboxCheck.metrics());
  ok(metrics.ignored > 0, `Messages hostiles ignorés : ${metrics.ignored}`);
  ok(metrics.errors === 0, "Aucune erreur interne dans l'iframe");

  // 3/4/5/8) bornes de sécurité exécutées DANS l'iframe (résultats postés au hôte)
  const bounds = await p.evaluate(() => window.__mgsSandboxCheck.boundsProbe());
  ok(bounds.networkBlocked === true, "Réseau bloqué (fetch/CSP) : " + bounds.networkDetail);
  ok(bounds.storageBlocked === true, "Stockage bloqué (SecurityError) : " + bounds.storageDetail);
  ok(bounds.topOpaque === true, "Contexte parent inaccessible (origine opaque)");
  ok(bounds.evalBlocked === true, "eval() bloqué dans l'iframe");

  const bufA3 = await snap(1.2);
  ok(bufA1.equals(bufA3), "Après attaques, seek(1.2) reste identique (résistance)");

  console.log("--- metrics:", JSON.stringify(metrics));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });