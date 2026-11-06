/**
 * Test d'export MP4 RÉEL (navigateur + ffmpeg) — mêmes mécanismes que
 * l'export de production (src/lib/render/engine.ts) : Chromium, seek(t)
 * image par image via window.__mgsiRender, pipe JPEG -> ffmpeg H.264.
 *
 * Formats : 16:9, 9:16, 1:1 — vérification : fichier, fréquence/cadence,
 * nombre d'images, durée (ffprobe absent => ffmpeg -i en décodeur).
 *
 * Lancer : TEMPLATE_CHECK=1 npm run build && TEMPLATE_CHECK=1 npm start -p 3001 &
 *          BASE_URL=http://localhost:3001 npm run test:export
 * (ffmpeg statique livré par ffmpeg-static ; Chromium système via channel chrome)
 */
import { spawn } from "node:child_process";
import { mkdir, stat, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
/** Navigateur : Chrome système si dispo, sinon Chromium Playwright. */
async function launchBrowser(opts = {}) {
  try { return await chromium.launch({ channel: "chrome", headless: true, ...opts }); }
  catch { return await chromium.launch({ headless: true, ...opts }); }
}

const require_ = createRequire(import.meta.url);
const ffmpegPath = require_("ffmpeg-static");
const BASE = process.env.BASE_URL || "http://localhost:3001";

const FORMATS = [
  { name: "16:9", width: 1920, height: 1080 },
  { name: "9:16", width: 1080, height: 1920 },
  { name: "1:1", width: 1080, height: 1080 },
];

const FPS = 30;
let failures = 0;
const ok = (c, msg) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) failures++; };

function ffmpeg(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: input ? ["pipe", "ignore", "pipe"] : ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += String(d)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve({ stderr }) : reject(new Error(`ffmpeg(${code}) ${stderr.slice(-4000)}`))));
    if (input) proc.stdin.write(input);
    if (input) proc.stdin.end();
  });
}

(async () => {
  const outDir = path.join(os.tmpdir(), "mgsi-export-test");
  await mkdir(outDir, { recursive: true });

  console.log("Export MP4 réel — Chromium:", (await import("node:child_process")).execSync(`"${ffmpegPath}" -version | head -1`).toString().trim());

  for (const format of FORMATS) {
    const started = Date.now();
    const b = await launchBrowser({});
    const page = await b.newPage({
      viewport: { width: format.width === 1920 ? 1200 : Math.round(1200 * (format.width / format.height)), height: 800 },
      deviceScaleFactor: format.width / 1000,
    });

    const url = `${BASE}/dev/render-stage?w=${format.width}&h=${format.height}`;
    const response = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    if (!response || response.status() >= 400) { ok(false, `${format.name} : page inaccessible (${response?.status()})`); await b.close(); continue; }
    await page.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
    const incompatible = await page.evaluate(() => window.__mgsiRender?.incompatible ?? []);
    if (incompatible.length) { ok(false, `${format.name} : templates non compatibles — ${incompatible.join(", ")}`); await b.close(); continue; }

    const seconds = 2;
    const frames = seconds * FPS;
    const out = path.join(outDir, `export-${format.name.replace(":", "x")}.mp4`);
    const args = [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-vf", `scale=${format.width}:${format.height}:flags=lanczos,setsar=1`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", out,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
    let encErr = "";
    proc.stderr.on("data", (d) => (encErr += String(d)));
    let stdinError = null;
    proc.stdin.on("error", (e) => (stdinError = e));

    // Capture + encodage image par image (mêmes commandes que l'export production)
    const stageLocator = page.locator("[data-render-stage]");
    let captured = 0;
    for (let i = 0; i < frames; i += 1) {
      await page.evaluate((t) => window.__mgsiRender.seek(t), i / FPS);
      const frame = await stageLocator.screenshot({ type: "jpeg", quality: 92 });
      if (!proc.stdin.write(frame)) await new Promise((resolve) => proc.stdin.once("drain", () => resolve()));
      captured += 1;
    }
    proc.stdin.end();
    await new Promise((resolve, reject) => { proc.on("error", reject); proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg(${code}) ${encErr.slice(-300)}`))); });
    await b.close();

    const file = await stat(out);
    ok(captured === frames, `${format.name} : ${captured}/${frames} images capturées en ${Math.round((Date.now() - started) / 100)/10}s`);
    ok(file.size > 10_000, `${format.name} : fichier MP4 (${Math.round(file.size / 1024)} Ko)`);
    ok(!stdinError, `${format.name} : pipe sans erreur`);

    // Vérifications réelles via ffmpeg : durée, flux H.264, décodage des images
    const info = await ffmpeg(["-i", out]).catch((e) => ({ stderr: e.message }));
    const isH264 = (info.stderr || "").includes("Video: h264");
    const durationMatch = (info.stderr || "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : -1;
    ok(isH264, `${format.name} : flux vidéo H.264`);
    ok(Math.abs(duration - seconds) < 0.2, `${format.name} : durée ${duration}s ≈ ${seconds}s`);

    // Décodage : autant d'images que capturées + identité avec le studio (diff première/dernière)
    const decodedDir = path.join(outDir, `frames-${format.name.replace(":", "")}`);
    await mkdir(decodedDir, { recursive: true });
    await ffmpeg(["-i", out, "-frames:v", String(frames), path.join(decodedDir, "f%03d.png")]);
    const decodedFrames = (await readdir(decodedDir)).length;
    // ffmpeg ajoute parfois une image dupliquée au flush (yuv420p/faststart) :
    ok(decodedFrames >= frames && decodedFrames <= frames + 1, `${format.name} : ${decodedFrames}/${frames} images décodées (±1 au flush ffmpeg)`);
    const first = await readFile(path.join(decodedDir, "f001.png"));
    const last = await readFile(path.join(decodedDir, `f0${frames}.png`));
    ok(first.length !== last.length || first.equals(last) === false, `${format.name} : première ≠ dernière image (mouvement réel)`);
    // correspondance au studio : ré-export d'une frame isolée comparable au navigateur
    await ffmpeg(["-i", out, "-vf", "select=eq(n\\,30)", "-frames:v", "1", path.join(decodedDir, "t1s.png")]);
    const t1s = await readFile(path.join(decodedDir, "t1s.png"));
    ok(t1s.length >= 100, `${format.name} : image à t=1s extractible`);
  }

  // ---- COHERENCE prévisualisation Studio <-> MP4 (frame par frame) ----
  // L'image du MP4 (16:9) à t=1.0 s et l'aperçu du moteur (même stage) à
  // t=1.0 s sont extraits, normalisés (sharp) puis comparés (tolérance JPEG).
  {
    const sharp = (await import("sharp")).default;
    const b = await launchBrowser({});
    const page = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1.92 });
    await page.goto(`${BASE}/dev/render-stage?w=1920&h=1080`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
    await page.evaluate(() => window.__mgsiRender.seek(1.0));
    await page.waitForTimeout(150);
    const browserShot = await page.locator("[data-render-stage]").screenshot({ type: "jpeg", quality: 92 });
    await b.close();
    const framesDir = path.join(outDir, "coherence");
    await mkdir(framesDir, { recursive: true });
    const mp4 = path.join(outDir, "export-16x9.mp4");
    await ffmpeg(["-i", mp4, "-vf", "select=eq(n\\,30)", "-frames:v", "1", path.join(framesDir, "t1s.png")]);
    const mp4Frame = await readFile(path.join(framesDir, "t1s.png"));
    const norm = async (buf) => await sharp(buf).resize(480, 270, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const px1 = await norm(browserShot);
    const px2 = await norm(mp4Frame);
    let diff = 0;
    const total = 480 * 270;
    for (let i = 0; i < px1.length; i += 4) {
      const d = Math.max(Math.abs(px1[i] - px2[i]), Math.abs(px1[i + 1] - px2[i + 1]), Math.abs(px1[i + 2] - px2[i + 2]));
      if (d > 28) diff += 1;
    }
    ok(diff / total < 0.10, `Prévisualisation vs MP4 (t=1s) : ${((100 * diff) / total).toFixed(2)} % de pixels différents (seuil 10 %)`);
  }

  // ---- REFUS si renderAt échoue à l'exécution (contract ok, rendu KO) ----
  {
    const b = await launchBrowser({});
    const page = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/dev/render-stage?w=1080&h=1080&broken=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
    const incompatible = await page.evaluate(() => window.__mgsiRender?.incompatible ?? []);
    // Ici le contrat EST déclaré (pas d'incompatibilité statique) : le refus
    // doit venir du RUNTIME (seek rejeté : FRAME_DÉGRADÉE).
    const seekResult = await page
      .evaluate(() => window.__mgsiRender.seek(0.3))
      .then(() => "resolved(!)", (e) => String(e?.message || e).slice(0, 200));
    ok(incompatible.length === 0, `Contrat déclaré : pas de refus statique (${incompatible.length})`);
    ok(String(seekResult).includes("FRAME_DÉGRADÉE"), `Seek rejeté pour renderAt en échec : ${seekResult.slice(0, 120)}`);
    await b.close();
  }

  // ---- REFUS de l'export si un template non pilotable est présent ----
  // Même vérification que le moteur d'export (openStage lit incompatible).
  {
    const b = await launchBrowser({});
    const page = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    const url = `${BASE}/dev/render-stage?w=1920&h=1080&degraded=1`;
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
    const incompatible = await page.evaluate(() => window.__mgsiRender?.incompatible ?? []);
    const refused = incompatible.length > 0;
    ok(refused, `Export refusé (template non pilotable) : ${incompatible.join(", ")}`);
    await b.close();
  }

  console.log(failures === 0 ? "\nExport MP4 : TOUS les tests passent." : `\n${failures} échec(s) d'export.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });