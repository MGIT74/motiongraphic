import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MediaAsset, MediaKind } from "@/lib/studio/project-model";
import { adminSupabase } from "@/lib/render/server-projects";
import { ffmpegPath, getBrowser } from "@/lib/render/engine";
import { assertPublicUrl, isPublicHost } from "./net-guard";

/**
 * Médias du Studio (images, vidéos, audio) — serveur uniquement.
 * - Stockage : bucket privé « studio-media », chemins `<user>/<projet>/<asset>.<ext>`.
 * - Le navigateur envoie le fichier directement à Supabase Storage (URL d'envoi
 *   signée), puis le serveur le « finalise » : mesure (dimensions, durée) et
 *   normalisation — vidéo → MP4 H.264 sans son (lisible partout, y compris par le
 *   rendu), audio → AAC (.m4a).
 * - Lecture : URL signées (quelques heures) générées à la demande.
 */

export const MEDIA_BUCKET = "studio-media";
export const MEDIA_MAX_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;

const ACCEPTED: Record<string, MediaKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/aac": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
};

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function mediaKindOf(mime: string): MediaKind | null {
  return ACCEPTED[mime.toLowerCase().split(";")[0].trim()] ?? null;
}

async function ensureBucket() {
  const client = await adminSupabase();
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error(`Stockage indisponible : ${error.message}`);
  if (!buckets?.some((b) => b.name === MEDIA_BUCKET)) {
    const { error: createError } = await client.storage.createBucket(MEDIA_BUCKET, { public: false });
    if (createError && !/already exists/i.test(createError.message)) throw new Error(`Création du bucket : ${createError.message}`);
  }
  return client;
}

function assetBase(userId: string, projectId: string, assetId: string) {
  const safe = (v: string) => v.replace(/[^A-Za-z0-9-]/g, "");
  return `${safe(userId)}/${safe(projectId)}/${safe(assetId)}`;
}

/* ------------------------------------------------------------------ */
/* Envoi direct depuis le navigateur                                    */
/* ------------------------------------------------------------------ */

export interface UploadTicket {
  assetId: string;
  path: string;
  signedUrl: string;
  token: string;
}

/** URL d'envoi signée (le fichier ne transite pas par le serveur web). */
export async function createUploadTicket(userId: string, projectId: string, mime: string, size: number): Promise<UploadTicket> {
  if (!mediaKindOf(mime)) throw new Error(`Format non pris en charge : ${mime}`);
  if (!(size > 0) || size > MEDIA_MAX_BYTES) throw new Error("Fichier trop lourd (200 Mo maximum).");
  const client = await ensureBucket();
  const assetId = randomUUID();
  const filePath = `${assetBase(userId, projectId, assetId)}.upload`;
  const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUploadUrl(filePath);
  if (error || !data) throw new Error(`URL d'envoi : ${error?.message ?? "inconnue"}`);
  return { assetId, path: filePath, signedUrl: data.signedUrl, token: data.token };
}

/* ------------------------------------------------------------------ */
/* Traitement (mesure + normalisation)                                  */
/* ------------------------------------------------------------------ */

async function runFfmpeg(args: string[]): Promise<string> {
  const bin = await ffmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-400) || `ffmpeg ${code}`))));
  });
}

interface Probe {
  duration?: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** Mesure un fichier avec ffmpeg (durée, dimensions, pistes). */
async function probe(file: string): Promise<Probe> {
  const bin = await ffmpegPath();
  const out: string = await new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", () => resolve(stderr));
    child.on("error", () => resolve(stderr));
  });
  const d = out.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = out.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : undefined,
    width: v ? Number(v[1]) : undefined,
    height: v ? Number(v[2]) : undefined,
    hasVideo: /Stream #[^\n]*Video:/.test(out),
    hasAudio: /Stream #[^\n]*Audio:/.test(out),
  };
}

/**
 * Normalise un fichier local et le dépose dans le stockage. Renvoie l'asset.
 * `sourceName` sert de nom affiché.
 */
async function processAndStore(opts: {
  file: string;
  mime: string;
  userId: string;
  projectId: string;
  assetId: string;
  name: string;
}): Promise<MediaAsset> {
  const kind = mediaKindOf(opts.mime);
  if (!kind) throw new Error(`Format non pris en charge : ${opts.mime}`);
  const client = await ensureBucket();
  const base = assetBase(opts.userId, opts.projectId, opts.assetId);
  const dir = path.dirname(opts.file);
  let outFile = opts.file;
  let outMime = opts.mime.toLowerCase().split(";")[0];
  let ext = EXT[outMime] ?? "bin";

  if (kind === "video") {
    outFile = path.join(dir, "out.mp4");
    await runFfmpeg([
      "-y", "-i", opts.file, "-t", String(MAX_VIDEO_SECONDS), "-an",
      "-vf", "scale='min(1920,iw)':-2:flags=lanczos,fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", outFile,
    ]);
    outMime = "video/mp4";
    ext = "mp4";
  } else if (kind === "audio") {
    outFile = path.join(dir, "out.m4a");
    await runFfmpeg(["-y", "-i", opts.file, "-vn", "-c:a", "aac", "-b:a", "192k", outFile]);
    outMime = "audio/mp4";
    ext = "m4a";
  }

  const info = outMime === "image/svg+xml" ? { hasVideo: false, hasAudio: false } as Probe : await probe(outFile);
  if (kind === "video" && !info.hasVideo) throw new Error("Aucune piste vidéo lisible dans ce fichier.");
  if (kind === "audio" && !info.hasAudio) throw new Error("Aucune piste audio lisible dans ce fichier.");

  const storagePath = `${base}.${ext}`;
  const { size } = await stat(outFile);
  const { error } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, await readFile(outFile), { contentType: outMime, upsert: true });
  if (error) throw new Error(`Dépôt du média : ${error.message}`);

  return {
    id: opts.assetId,
    kind,
    name: opts.name.slice(0, 120) || kind,
    storagePath,
    mime: outMime,
    ...(info.width ? { width: info.width } : {}),
    ...(info.height ? { height: info.height } : {}),
    ...(kind !== "image" && info.duration ? { duration: Math.round(info.duration * 100) / 100 } : {}),
    sizeBytes: size,
    createdAt: new Date().toISOString(),
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mgsi-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Finalise un envoi direct : télécharge le fichier envoyé, le normalise, le range. */
export async function finalizeUpload(opts: {
  userId: string;
  projectId: string;
  assetId: string;
  mime: string;
  name: string;
}): Promise<MediaAsset> {
  const client = await ensureBucket();
  const uploadPath = `${assetBase(opts.userId, opts.projectId, opts.assetId)}.upload`;
  const { data, error } = await client.storage.from(MEDIA_BUCKET).download(uploadPath);
  if (error || !data) throw new Error(`Fichier envoyé introuvable : ${error?.message ?? ""}`);
  const asset = await withTempDir(async (dir) => {
    const file = path.join(dir, "source");
    await writeFile(file, Buffer.from(await data.arrayBuffer()));
    return processAndStore({ ...opts, file });
  });
  await client.storage.from(MEDIA_BUCKET).remove([uploadPath]).catch(() => undefined);
  return asset;
}

/* ------------------------------------------------------------------ */
/* Import par URL et capture d'écran (MCP)                              */
/* ------------------------------------------------------------------ */

/** Télécharge un média public (http/https, hors réseau privé) et le range. */
export async function importFromUrl(opts: { userId: string; projectId: string; url: string; name?: string }): Promise<MediaAsset> {
  let current = await assertPublicUrl(opts.url);
  let res: Response | null = null;
  // Redirections suivies à la main : chaque étape est revérifiée (pas de rebond vers le réseau interne).
  for (let hop = 0; hop < 5; hop += 1) {
    res = await fetch(current, { redirect: "manual", headers: { "user-agent": "MotionGraphic-Studio/1.0" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = await assertPublicUrl(new URL(res.headers.get("location") as string, current).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`Téléchargement impossible (${res?.status ?? "aucune réponse"}).`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mediaKindOf(mime)) throw new Error(`Type de contenu non pris en charge : ${mime || "inconnu"}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MEDIA_MAX_BYTES) throw new Error("Fichier trop lourd (200 Mo maximum).");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MEDIA_MAX_BYTES) throw new Error("Fichier trop lourd (200 Mo maximum).");
  const assetId = randomUUID();
  const name = opts.name || decodeURIComponent(path.basename(current.pathname)) || "média";
  return withTempDir(async (dir) => {
    const file = path.join(dir, "source");
    await writeFile(file, buf);
    return processAndStore({ file, mime, userId: opts.userId, projectId: opts.projectId, assetId, name });
  });
}

/** Capture d'écran d'une page web publique (PNG), rangée comme média image. */
/**
 * Exécuté dans la page avant la capture : masque (sans cliquer, donc sans
 * consentement donné ni navigation) les bandeaux cookies / RGPD et les bulles
 * de chat flottantes, qui gâchent une capture d'écran de démonstration.
 */
const HIDE_OVERLAYS_SCRIPT = `(() => {
  const hide = (el) => el && el.style && el.style.setProperty("display", "none", "important");
  const known = [
    "#onetrust-banner-sdk", "#onetrust-consent-sdk", "#CybotCookiebotDialog", "#cookiebanner", "#cookie-banner",
    "#cookie-notice", "#cookie-law-info-bar", ".cc-window", ".cc-banner", ".cky-consent-container", "#axeptio_overlay",
    "#tarteaucitronRoot", "#didomi-host", ".qc-cmp2-container", "#usercentrics-root", "#iubenda-cs-banner",
    "#intercom-container", ".intercom-lightweight-app", "#crisp-chatbox", "#hubspot-messages-iframe-container",
    "#tidio-chat", "#fc_frame", ".tawk-min-container", "iframe[title*='chat' i]"
  ];
  known.forEach((sel) => { try { document.querySelectorAll(sel).forEach(hide); } catch (e) {} });
  const consent = /cookie|consentement|consent|rgpd|gdpr|vie priv[ée]e|confidentialit[ée]|privacy/i;
  const vw = window.innerWidth, vh = window.innerHeight;
  document.querySelectorAll("body *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const text = (el.innerText || "").slice(0, 2000);
    // Bandeau / fenêtre de consentement (pas une barre de navigation : texte court sur la vie privée).
    if (consent.test(text) && text.length < 1500 && !(r.top <= 1 && r.height < 120 && el.querySelectorAll("a").length > 4)) {
      hide(el);
      return;
    }
    // Bulle flottante (chat, support) collée à un coin bas.
    const small = r.width <= 140 && r.height <= 140;
    const bottom = vh - r.bottom <= 60;
    const corner = r.left <= 60 || vw - r.right <= 60;
    if (small && bottom && corner) hide(el);
  });
  // Défilement bloqué par certaines fenêtres modales de consentement.
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
})()`;

export async function captureScreenshot(opts: {
  userId: string;
  projectId: string;
  url: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  name?: string;
  /** Masque les bandeaux cookies et les bulles de chat (défaut : oui). */
  clean?: boolean;
}): Promise<MediaAsset> {
  const target = await assertPublicUrl(opts.url);
  const width = Math.max(320, Math.min(2560, Math.round(opts.width ?? 1440)));
  const height = Math.max(320, Math.min(2560, Math.round(opts.height ?? 900)));
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    // Toute requête de la page vers un hôte privé est bloquée.
    await page.route("**/*", async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (route.request().url().startsWith("data:") || (await isPublicHost(host))) await route.continue();
      else await route.abort();
    });
    await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => {
      await page.waitForLoadState("load", { timeout: 15_000 });
    });
    // Les bandeaux de consentement apparaissent souvent après un court délai.
    await page.waitForTimeout(opts.clean === false ? 800 : 1500);
    if (opts.clean !== false) {
      await page.evaluate(HIDE_OVERLAYS_SCRIPT).catch(() => undefined);
      await page.waitForTimeout(250);
    }
    const png = await page.screenshot({ type: "png", fullPage: opts.fullPage === true });
    const assetId = randomUUID();
    return await withTempDir(async (dir) => {
      const file = path.join(dir, "source.png");
      await writeFile(file, png);
      return processAndStore({
        file,
        mime: "image/png",
        userId: opts.userId,
        projectId: opts.projectId,
        assetId,
        name: opts.name || `Capture ${target.hostname}`,
      });
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Lecture                                                              */
/* ------------------------------------------------------------------ */

/** URL signées (lecture) des médias d'un projet : { assetId: url }. */
export async function signedMediaUrls(assets: Pick<MediaAsset, "id" | "storagePath">[], expiresIn = 6 * 3600): Promise<Record<string, string>> {
  if (assets.length === 0) return {};
  const client = await adminSupabase();
  const { data } = await client.storage.from(MEDIA_BUCKET).createSignedUrls(assets.map((a) => a.storagePath), expiresIn);
  const out: Record<string, string> = {};
  (data ?? []).forEach((entry, i) => {
    if (entry?.signedUrl) out[assets[i].id] = entry.signedUrl;
  });
  return out;
}

/** Télécharge un média (rendu : piste audio) dans un fichier local. */
export async function downloadMedia(storagePath: string, file: string): Promise<void> {
  const client = await adminSupabase();
  const { data, error } = await client.storage.from(MEDIA_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Média introuvable : ${error?.message ?? storagePath}`);
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
}
