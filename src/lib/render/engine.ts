import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright-core";
import { renderStageSize } from "./stage-size";
import { adminSupabase, loadStoredProject } from "./server-projects";
import { signRenderToken } from "./token";
import { projectDuration } from "@/lib/studio/project-model";

/**
 * Moteur de rendu vidéo (serveur) :
 * 1. un Chromium sans fenêtre ouvre /render/<projet> (jeton signé) ;
 * 2. pour chaque image (30 i/s) : seek(t) puis capture JPEG en résolution finale ;
 * 3. les images sont envoyées à ffmpeg (H.264, yuv420p, faststart) ;
 * 4. le MP4 est déposé dans Supabase Storage (bucket privé « studio-renders »)
 *    avec un lien signé 7 jours — à défaut, servi par le serveur (lien signé).
 * Un seul rendu à la fois (file d'attente) pour préserver la mémoire du serveur.
 */

export type RenderStatus = "pending" | "running" | "done" | "error";

export interface RenderJob {
  id: string;
  projectId: string;
  userId: string;
  status: RenderStatus;
  progress: number; // 0..1
  frames: number;
  framesDone: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  storagePath?: string;
  localPath?: string;
  width?: number;
  height?: number;
  duration?: number;
}

const BUCKET = "studio-renders";
const jobs = new Map<string, RenderJob>();
let queue: Promise<void> = Promise.resolve();

/* ------------------------------------------------------------------ */
/* Navigateur                                                          */
/* ------------------------------------------------------------------ */

let browserPromise: Promise<Browser> | null = null;

async function chromiumExecutable(): Promise<{ executablePath: string; args: string[] }> {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return { executablePath: fromEnv, args: ["--no-sandbox"] };
  for (const candidate of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(candidate)) return { executablePath: candidate, args: ["--no-sandbox"] };
  }
  // Chromium autonome livré par npm (bibliothèques incluses) : aucune installation système.
  const sparticuz = (await import("@sparticuz/chromium")).default;
  return { executablePath: await sparticuz.executablePath(), args: sparticuz.args };
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser?.isConnected()) return browser;
  }
  browserPromise = (async () => {
    const { chromium } = await import("playwright-core");
    const { executablePath, args } = await chromiumExecutable();
    const browser = await chromium.launch({ executablePath, args, headless: true });
    browser.on("disconnected", () => {
      browserPromise = null;
    });
    return browser;
  })();
  return browserPromise;
}

/** URL de base que le navigateur interne utilise pour joindre l'application. */
let detectedBaseUrl: string | undefined;
export function rememberBaseUrl(url: string | undefined) {
  if (url && !detectedBaseUrl) detectedBaseUrl = url.replace(/\/+$/, "");
}
function baseUrl(): string {
  return (
    process.env.RENDER_BASE_URL?.replace(/\/+$/, "") ||
    detectedBaseUrl ||
    `http://127.0.0.1:${process.env.PORT || 3000}`
  );
}

async function openStage(projectId: string, scale?: number) {
  const stored = await loadStoredProject(projectId);
  if (!stored) throw new Error(`Projet introuvable : ${projectId}`);
  const size = renderStageSize(stored.project);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: Math.round(size.width), height: Math.round(size.height) },
    deviceScaleFactor: scale ?? size.deviceScaleFactor,
  });
  const page = await context.newPage();
  const url = `${baseUrl()}/render/${encodeURIComponent(projectId)}?k=${signRenderToken("render", projectId)}`;
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  if (!response || response.status() >= 400) {
    await context.close();
    throw new Error(`Page de rendu inaccessible (${response?.status() ?? "aucune réponse"}) : ${baseUrl()}`);
  }
  await page.waitForFunction(() => window.__mgsiRender?.ready === true, undefined, { timeout: 30_000 });
  return { stored, context, page, size };
}

/* ------------------------------------------------------------------ */
/* Aperçu d'une image                                                  */
/* ------------------------------------------------------------------ */

/** Capture JPEG d'un instant du projet (largeur 960 px par défaut). */
export async function previewFrame(projectId: string, time: number, width = 960): Promise<Buffer> {
  const stored = await loadStoredProject(projectId);
  if (!stored) throw new Error(`Projet introuvable : ${projectId}`);
  const size = renderStageSize(stored.project);
  const scale = Math.max(0.25, Math.min(2, width / size.width));
  const { context, page } = await openStage(projectId, scale);
  try {
    const duration = projectDuration(stored.project);
    const t = Math.max(0, Math.min(duration - 1 / 30, time));
    await page.evaluate((value) => window.__mgsiRender!.seek(value), t);
    return await page.locator("[data-render-stage]").screenshot({ type: "jpeg", quality: 85 });
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/* Rendu MP4                                                           */
/* ------------------------------------------------------------------ */

async function ffmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
  const resolved = typeof mod === "string" ? mod : mod.default;
  if (!resolved || !existsSync(resolved)) throw new Error("ffmpeg introuvable (paquet ffmpeg-static).");
  return resolved;
}

async function persistJob(job: RenderJob) {
  try {
    const client = await adminSupabase();
    await client.from("studio_renders").upsert(
      {
        id: job.id,
        project_id: job.projectId,
        user_id: job.userId,
        status: job.status,
        format: "mp4",
        resolution: "1080p",
        fps: 30,
        storage_path: job.storagePath ?? null,
        error: job.error?.slice(0, 500) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {
    // Table indisponible : l'état reste en mémoire (perdu au redémarrage).
  }
}

/** Démarre (en file d'attente) le rendu MP4 d'un projet enregistré. */
export async function startRender(projectId: string): Promise<RenderJob> {
  const stored = await loadStoredProject(projectId);
  if (!stored) throw new Error(`Projet introuvable dans le cloud : ${projectId}`);
  const duration = projectDuration(stored.project);
  const job: RenderJob = {
    id: randomUUID(),
    projectId,
    userId: stored.userId,
    status: "pending",
    progress: 0,
    frames: Math.max(1, Math.round(duration * 30)),
    framesDone: 0,
    width: stored.project.width,
    height: stored.project.height,
    duration,
  };
  jobs.set(job.id, job);
  await persistJob(job);
  queue = queue.then(() => runRender(job)).catch(() => undefined);
  return job;
}

async function runRender(job: RenderJob) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  await persistJob(job);
  const dir = path.join(os.tmpdir(), "mgsi-renders");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${job.id}.mp4`);
  let stage: Awaited<ReturnType<typeof openStage>> | null = null;
  try {
    stage = await openStage(job.projectId);
    const { page } = stage;
    const ffmpeg = spawn(
      await ffmpegPath(),
      [
        "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-vf", `scale=${job.width}:${job.height}:flags=lanczos,setsar=1`,
        "-movflags", "+faststart", out,
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let stderr = "";
    ffmpeg.stderr.on("data", (d) => (stderr += String(d)));
    const done = new Promise<void>((resolve, reject) => {
      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}) : ${stderr.slice(-300)}`))));
    });
    let pipeError: Error | null = null;
    ffmpeg.stdin.on("error", (e) => (pipeError = e));
    const write = async (buf: Buffer) => {
      if (pipeError) throw pipeError;
      if (!ffmpeg.stdin.write(buf)) await new Promise<void>((resolve) => ffmpeg.stdin.once("drain", () => resolve()));
    };

    const stageLocator = page.locator("[data-render-stage]");
    for (let i = 0; i < job.frames; i += 1) {
      await page.evaluate((t) => window.__mgsiRender!.seek(t), i / 30);
      const frame = await stageLocator.screenshot({ type: "jpeg", quality: 92 });
      await write(frame);
      job.framesDone = i + 1;
      job.progress = (i + 1) / job.frames;
    }
    ffmpeg.stdin.end();
    await done;
    job.localPath = out;

    // Dépôt dans Supabase Storage (si disponible).
    try {
      const client = await adminSupabase();
      const { data: buckets } = await client.storage.listBuckets();
      if (!buckets?.some((b) => b.name === BUCKET)) {
        await client.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 200 * 1024 * 1024 });
      }
      const storagePath = `${job.userId}/${job.projectId}/${job.id}.mp4`;
      const { error } = await client.storage
        .from(BUCKET)
        .upload(storagePath, await readFile(out), { contentType: "video/mp4", upsert: true });
      if (!error) job.storagePath = storagePath;
    } catch {
      // Stockage indisponible : le fichier reste servi par le serveur.
    }
    job.status = "done";
    job.progress = 1;
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.finishedAt = new Date().toISOString();
    await stage?.context.close().catch(() => undefined);
    await persistJob(job);
  }
}

/** État d'un rendu + lien de téléchargement (signé) quand il est terminé. */
export async function getRender(renderId: string): Promise<(RenderJob & { url?: string; sizeBytes?: number }) | null> {
  let job = jobs.get(renderId);
  if (!job) {
    try {
      const client = await adminSupabase();
      const { data } = await client.from("studio_renders").select("*").eq("id", renderId).maybeSingle();
      if (!data) return null;
      const row = data as { id: string; project_id: string; user_id: string; status: RenderStatus; storage_path: string | null; error: string | null };
      job = {
        id: row.id,
        projectId: row.project_id,
        userId: row.user_id,
        status: row.status === "running" ? "error" : row.status,
        progress: row.status === "done" ? 1 : 0,
        frames: 0,
        framesDone: 0,
        storagePath: row.storage_path ?? undefined,
        error: row.status === "running" ? "Rendu interrompu (redémarrage du serveur). Relancez-le." : row.error ?? undefined,
      };
    } catch {
      return null;
    }
  }
  if (job.status !== "done") return { ...job };
  let url: string | undefined;
  if (job.storagePath) {
    try {
      const client = await adminSupabase();
      const { data } = await client.storage.from(BUCKET).createSignedUrl(job.storagePath, 7 * 24 * 3600, { download: true });
      url = data?.signedUrl;
    } catch {
      url = undefined;
    }
  }
  if (!url && job.localPath && existsSync(job.localPath)) {
    url = `${publicBaseUrl()}/api/studio/render/${job.id}/file?k=${signRenderToken("file", job.id)}`;
  }
  const sizeBytes = job.localPath && existsSync(job.localPath) ? (await stat(job.localPath)).size : undefined;
  return { ...job, url, sizeBytes };
}

/** Fichier local d'un rendu (téléchargement de secours). */
export function localRenderFile(renderId: string): string | null {
  const file = path.join(os.tmpdir(), "mgsi-renders", `${renderId}.mp4`);
  return existsSync(file) ? file : null;
}

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || detectedBaseUrl || baseUrl()).replace(/\/+$/, "");
}
