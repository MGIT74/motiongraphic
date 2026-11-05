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
/** Comparaison PIXELS (tolérance anti-aliasing) : identique si <0.05 % des pixels différents. */
function samePixels(aBuf, bBuf, tolerance = 24) {
  const { PNG } = require("pngjs");
  const A = PNG.sync.read(aBuf);
  const B = PNG.sync.read(bBuf);
  if (A.width !== B.width || A.height !== B.height) return false;
  let diff = 0;
  const total = A.width * A.height;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > tolerance) diff += 1;
  }
  return diff / total < 0.0005;
}

/** Différence de contenu réelle (mouvement). */
function pixelsDiffer(aBuf, bBuf, tolerance = 24) {
  const { PNG } = require("pngjs");
  const A = PNG.sync.read(aBuf);
  const B = PNG.sync.read(bBuf);
  if (A.width !== B.width || A.height !== B.height) return true;
  let diff = 0;
  const total = A.width * A.height;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > tolerance) diff += 1;
  }
  return diff / total > 0.004;
}

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
  ok(samePixels(bufA1, bufA2), "Déterminisme : seek(1.2) -> images identiques (pixels)");
  ok(pixelsDiffer(bufA1, bufB), "Le temps change bien l'image (1.2 ≠ 0.3)");

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
  ok(samePixels(bufA1, bufA3), "Après attaques, seek(1.2) reste identique (résistance)");

  // ---- SET_PARAMS -> ACK -> SEEK (premier rendu + changes rapides) ----
  // A) Premier rendu avec des params personnalisés : le premier SEEK n'est
  // envoyé qu'APRÈS l'acquittement SET_PARAMS (aucune capture d'anciens params).
  await p.evaluate(() => window.__mgsSandboxCheck.setParams({ text: "PARAMETRE", accentColor: "#64D2FF" }));
  const bufP1 = await snap(1.5);
  const bufP2 = await snap(1.5);
  ok(samePixels(bufP1, bufP2), "Après SET_PARAMS : rendu stable (pas de battement)");
  // Le texte a bien changé (la première image doit refléter les NOUVEAUX params).
  ok(pixelsDiffer(bufP1, bufA3), "Le rendu réagit aux nouveaux paramètres (texte/couleur)");
  // B) Changements rapides : 5 changements consécutifs -> le DERNIER gagne.
  for (const text of ["A", "B", "C", "D", "FINAL"]) {
    await p.evaluate((v) => window.__mgsSandboxCheck.setParams({ text: v }), text);
  }
  const bufQ1 = await snap(1.5);
  const bufQ2 = await snap(1.5);
  ok(samePixels(bufQ1, bufQ2), "Après 5 changements rapides : rendu stable");
  ok(pixelsDiffer(bufQ1, bufP1), "Le dernier changement a été appliqué au rendu");
  // C) La séquence SEEK continue d'acquitter (aucune promesse bloquée).
  const seekOk = await p.evaluate(() => window.__mgsSandboxCheck.seek(2.0)).then(() => true, () => false);
  ok(seekOk, "SEEK continue d'acquitter après les changements de paramètres");

  // ---- CACHE des documents sandbox (régressions sécurité) ----
  const headerOf = async (path) => {
    const res = await p.request.get(BASE + path);
    return { status: res.status(), cache: res.headers()["cache-control"] ?? "" };
  };
  const unknown = await headerOf("/sandbox/sandbox-inconnu-xyz?s=t");
  ok(unknown.status === 404 && unknown.cache.includes("no-store"), "Template inconnu : 404 + no-store (" + unknown.status + ", " + unknown.cache + ")");
  const probeHeaders = await headerOf("/sandbox/sandbox-check-probe?s=t");
  ok(probeHeaders.status === 200 && probeHeaders.cache.includes("private") && probeHeaders.cache.includes("no-store"), "Candidate (non publie) : private/no-store (" + probeHeaders.cache + ")");
  const pulseHeaders = await headerOf("/sandbox/pulse-grid-demo?s=t");
  ok(pulseHeaders.status === 200 && pulseHeaders.cache.includes("public") && pulseHeaders.cache.includes("max-age=30"), "Publie : cache public court (" + pulseHeaders.cache + ")");
  const noStoreAfterUnpublish = await headerOf("/sandbox/cache-code-01?s=t");
  ok(noStoreAfterUnpublish.cache.includes("no-store") || noStoreAfterUnpublish.status === 404, "Depublie : plus de cache public (" + noStoreAfterUnpublish.status + ", " + noStoreAfterUnpublish.cache + ")");

  console.log("--- metrics:", JSON.stringify(metrics));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });