/**
 * Tests de bout en bout du Studio (navigateur réel, mode démo sans Supabase).
 * Lancer :  CONSTRUCTION_MODE=off npm run build && CONSTRUCTION_MODE=off npm start &
 *           BASE_URL=http://localhost:3000 npm run test:e2e
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errors = []; p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type()==="error") errors.push(m.text().slice(0,120)); });
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) process.exitCode = 1; };
await p.goto(BASE + "/studio", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
await p.locator('input[aria-label="Nom du projet"]').fill("Test renommage"); await p.waitForTimeout(100);
ok(!(await p.locator('button[aria-label="Annuler (Cmd+Z)"]').isDisabled()), "Annuler disponible après renommage");
await p.locator('button[aria-label="Annuler (Cmd+Z)"]').click(); await p.waitForTimeout(200);
const s = p.locator('[role="slider"]'); const val = async () => Number(await s.getAttribute("aria-valuenow"));
const box = await s.boundingBox();
const play = () => p.locator('button[aria-label="Lecture"]').click(); const pause = () => p.locator('button[aria-label="Pause"]').click();
// 1 reprise
await play(); await p.waitForTimeout(1500); await pause(); const a = await val();
await play(); await p.waitForTimeout(500); await pause(); const c = await val();
ok(c > a, `Reprise après pause : ${a}s -> ${c}s`);
// scrub puis lecture
await p.mouse.click(box.x + 6*72, box.y + 10); await p.waitForTimeout(200);
await play(); await p.waitForTimeout(500); await pause(); const d = await val();
ok(d >= 6.3, `Lecture après scrub à 6s -> ${d}s`);
// fin puis relance
await p.mouse.click(box.x + 9*72, box.y + 10); await p.waitForTimeout(200); await play(); await p.waitForTimeout(2600);
console.log("   fin atteinte :", await val(), await p.locator('button[aria-label="Lecture"]').count() ? "(à l'arrêt)" : "(en lecture)");
await play(); await p.waitForTimeout(400); await pause(); const e2 = await val();
ok(e2 < 1, `Relance depuis la fin repart au début -> ${e2}s`);
// position scène 2
await p.mouse.click(box.x + 6*72, box.y + 10); await p.waitForTimeout(300);
const el2 = p.locator('[role="button"][aria-label^="Élément Cards UI"]'); const bb = await el2.boundingBox();
const pos = (bb.x - box.x) / 72; ok(Math.abs(pos - 5) < 0.1, `Cards UI (scène 2) affiché à ${pos.toFixed(2)}s (attendu 5s)`);
await p.screenshot({ path: (process.env.SHOTS_DIR || "/tmp") + "/apres-scene2.png" });
// sélection clic timeline
await el2.click({ position: { x: 30, y: 20 } }); await p.waitForTimeout(300);
ok((await el2.getAttribute("class")).includes("border-accent bg-accent"), "Clic sur un bloc de timeline le sélectionne");
ok((await p.locator("aside").last().innerText()).includes("Cards UI"), "Panneau droit ouvert sur Cards UI");
const val2 = await val(); ok(Math.abs(val2-6) < 0.1, `Le clic n'a pas déplacé le curseur (${val2}s)`);
// scène 1, style custom
await p.mouse.click(box.x + 1*72, box.y + 10); await p.waitForTimeout(300);
const el1 = p.locator('[role="button"][aria-label^="Élément Titre"]'); await el1.click({ position: { x: 30, y: 20 } }); await p.waitForTimeout(800);
const right = p.locator("aside").last();
const styleBtns = right.locator("button:has-text('CTA Hero')");
ok(await styleBtns.count() === 1, "Style « CTA Hero » présent une fois");
const checks = await right.locator("button[disabled]:has(svg)").count(); ok(checks === 1, `Un seul style marqué « actuel » (${checks})`);
await styleBtns.first().click(); await p.waitForTimeout(600);
const sub = await right.innerText();
ok(!sub.split("\n").slice(0,3).join(" ").includes("kinetic-type-01") , "Après choix, l'élément utilise la clé du template custom : " + sub.split("\n").slice(0,2).join(" / "));
const cb = await p.locator('[aria-label^="Aperçu"]').boundingBox();
await p.screenshot({ path: (process.env.SHOTS_DIR || "/tmp") + "/apres-cta-hero.png" });
ok(!(await p.locator('[aria-label^="Aperçu"]').innerText()).includes("Aucun élément"), "L'aperçu affiche toujours l'animation");
await p.locator('button[aria-label="Annuler (Cmd+Z)"]').click(); await p.waitForTimeout(400);
ok((await right.innerText()).includes("kinetic-type-01"), "Annuler revient au Kinetic Typography");
// suppression d'un élément NON sélectionné (scène 2) via poubelle
await p.mouse.click(box.x + 6*72, box.y + 10); await p.waitForTimeout(300);
await p.mouse.click(cb.x + 5, cb.y + 5); await p.waitForTimeout(200); // désélection
const trash = el2.locator('[title="Supprimer l\'élément"]'); await el2.hover(); await trash.click(); await p.waitForTimeout(400);
ok(await el2.count() === 0, "Poubelle supprime l'élément de la scène 2 (non sélectionné)");
await p.locator('button[aria-label="Annuler (Cmd+Z)"]').click(); await p.waitForTimeout(300);
ok(await el2.count() === 1, "Annuler restaure l'élément supprimé");
// poignée de redimensionnement : double clic ne supprime plus
const handle = el2.locator('[aria-label^="Trim droit"]'); await handle.dblclick(); await p.waitForTimeout(300);
ok(await el2.count() === 1, "Double-clic sur la poignée ne supprime plus");
// redimensionner via poignée
const hb = await handle.boundingBox(); const before = await el2.getAttribute("aria-label");
await p.mouse.move(hb.x+3, hb.y+10); await p.mouse.down(); await p.mouse.move(hb.x+3-72, hb.y+10, {steps:5}); await p.mouse.up(); await p.waitForTimeout(300);
ok(before !== await el2.getAttribute("aria-label"), `Redimensionnement : ${before} -> ${await el2.getAttribute("aria-label")}`);
// persistance
await p.waitForTimeout(1200); await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1500);
ok(await p.locator('[role="button"][aria-label^="Élément"]').count() >= 1, "Projet rechargé après reload");
// mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(BASE + "/studio", { waitUntil: "networkidle" }); await m.waitForTimeout(800);
ok(await m.getByText("Le Studio s'utilise sur un écran plus grand.").isVisible(), "Message mobile affiché");
await m.screenshot({ path: (process.env.SHOTS_DIR || "/tmp") + "/apres-mobile.png" });
ok(!(await p.getByText("Le Studio s'utilise sur un écran plus grand.").isVisible()), "Message masqué sur ordinateur");
const dup = errors.filter(x => x.includes("same key")); ok(dup.length === 0, `Plus d'erreur de clé en double (${dup.length})`);
console.log("Autres erreurs console:", errors.filter(x=>!x.includes("same key")).slice(0,5));
await b.close(); })().catch((e) => { console.error(e); process.exit(1); });
