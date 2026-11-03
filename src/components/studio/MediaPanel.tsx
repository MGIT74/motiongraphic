"use client";

import { friendlyError } from "@/lib/studio/errors";
import { useToasts } from "./Toasts";

import { useState } from "react";
import { Film, Image as ImageIcon, Loader2, Music, Plus, Upload, X } from "lucide-react";
import type { MediaAsset, ProjectAudio, StudioProject } from "@/lib/studio/project-model";

/** Envoi d'un fichier : URL signée → envoi direct au stockage → finalisation serveur. */
export async function uploadMediaFile(projectId: string, file: File): Promise<MediaAsset> {
  const ticketRes = await fetch("/api/studio/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: projectId, mime: file.type, size: file.size }),
  });
  const ticket = (await ticketRes.json().catch(() => ({}))) as { asset_id?: string; path?: string; token?: string; error?: string };
  if (!ticketRes.ok || !ticket.asset_id || !ticket.path || !ticket.token) throw new Error(ticket.error ?? `Envoi refusé (${ticketRes.status})`);

  const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
  const client = createSupabaseBrowserClient();
  if (!client) throw new Error("Supabase non configuré.");
  const { error } = await client.storage.from("studio-media").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw new Error(`Envoi du fichier : ${error.message}`);

  const finRes = await fetch("/api/studio/media/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: projectId, asset_id: ticket.asset_id, mime: file.type, name: file.name }),
  });
  const fin = (await finRes.json().catch(() => ({}))) as { asset?: MediaAsset; error?: string };
  if (!finRes.ok || !fin.asset) throw new Error(fin.error ?? `Traitement impossible (${finRes.status})`);
  return fin.asset;
}

function formatDuration(s?: number) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export default function MediaPanel({
  project,
  urls,
  onAddAsset,
  onAddToScene,
  onSetAudio,
}: {
  project: StudioProject;
  urls: Record<string, string>;
  onAddAsset: (asset: MediaAsset) => void;
  onAddToScene: (asset: MediaAsset) => void;
  onSetAudio: (audio: ProjectAudio | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toasts = useToasts();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      setBusy(`Import de « ${file.name} »…`);
      try {
        onAddAsset(await uploadMediaFile(project.id, file));
      } catch (e) {
        const f = friendlyError(e, "upload");
        setError(`${file.name} : ${f.title}`);
        toasts.error(e, "upload", () => void onFiles(singleFileList(file)));
      }
    }
    setBusy(null);
  };

  const visual = project.media.filter((m) => m.kind !== "audio");
  const audios = project.media.filter((m) => m.kind === "audio");
  const music = project.audio;

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Captures d’écran, vidéos de votre app et musique. Les vidéos sont converties en MP4 (2 min max) ; 200 Mo par fichier.
      </p>
      <label
        className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-xs font-medium transition-colors ${
          busy ? "border-accent/40 text-accent" : "border-line text-muted hover:border-accent/50 hover:text-ink"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
        {busy ?? "Importer des fichiers"}
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/quicktime,video/webm,audio/*"
          className="sr-only"
          disabled={Boolean(busy)}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error ? <p className="px-1 text-[11px] text-red-300">{error}</p> : null}

      {visual.length > 0 ? (
        <div>
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Images et vidéos</p>
          <div className="grid grid-cols-2 gap-2">
            {visual.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onAddToScene(asset)}
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-line bg-background text-left transition-colors hover:border-accent/50"
                title={`Ajouter « ${asset.name} » à la scène`}
                aria-label={`Ajouter ${asset.name} à la scène`}
              >
                <div className="relative aspect-video w-full bg-black">
                  {urls[asset.id] && asset.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[asset.id]} alt="" className="h-full w-full object-cover" />
                  ) : urls[asset.id] && asset.kind === "video" ? (
                    <video src={`${urls[asset.id]}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                      {asset.kind === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Plus className="h-5 w-5 text-white" aria-hidden="true" />
                  </span>
                  {asset.kind === "video" ? (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[9px] text-white">{formatDuration(asset.duration)}</span>
                  ) : null}
                </div>
                <span className="block truncate px-1.5 py-1 text-[10px] text-ink/80">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Musique</p>
        {audios.length === 0 ? <p className="px-1 text-[11px] text-muted/70">Importez un fichier audio (MP3, WAV, M4A…).</p> : null}
        <div className="flex flex-col gap-1.5">
          {audios.map((asset) => {
            const active = music?.assetId === asset.id;
            return (
              <div key={asset.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? "border-accent/60 bg-accent/5" : "border-line bg-background"}`}>
                <Music className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{asset.name}</span>
                <span className="font-mono text-[9px] text-muted">{formatDuration(asset.duration)}</span>
                {active ? (
                  <button type="button" onClick={() => onSetAudio(null)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-line text-muted hover:text-ink" aria-label="Retirer la musique">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetAudio({ assetId: asset.id, volume: 0.8, start: 0, trimStart: 0, fadeIn: 0.5, fadeOut: 1.5 })}
                    className="h-6 cursor-pointer rounded-md border border-line px-2 text-[10px] text-muted hover:border-accent/50 hover:text-ink"
                  >
                    Utiliser
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {music ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["Volume", "volume", 0, 1, 0.05],
                ["Début (s)", "start", 0, 600, 0.5],
                ["Fondu entrée", "fadeIn", 0, 10, 0.5],
                ["Fondu sortie", "fadeOut", 0, 10, 0.5],
              ] as const
            ).map(([label, key, min, max, step]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={music[key]}
                  onChange={(e) => onSetAudio({ ...music, [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) })}
                  className="h-8 rounded-lg border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                  aria-label={`Musique : ${label}`}
                />
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Liste de fichiers d'un seul élément (pour « Réessayer » un import). */
function singleFileList(file: File): FileList {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}
