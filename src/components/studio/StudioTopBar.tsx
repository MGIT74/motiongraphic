"use client";

import type React from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Play, Plus, Redo2, Undo2 } from "lucide-react";
import { PROJECT_FORMATS, STUDIO_FPS, type ProjectFormat } from "@/lib/studio/project-model";

function formatTimecode(time: number, fps = STUDIO_FPS): string {
  const totalFrames = Math.floor(time * fps);
  const frames = totalFrames % fps;
  const seconds = Math.floor(time) % 60;
  const minutes = Math.floor(time / 60);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export type StudioSaveState = "idle" | "saving" | "saved" | "error";

export default function StudioTopBar({
  projectName,
  onRename,
  onNewProject,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  playing,
  onTogglePlay,
  time,
  duration,
  saveState,
  cloudState,
  fps,
  format,
  onChangeFormat,
  onReloadRemote,
  onKeepLocal,
  exportSlot,
  projectsSlot,
  compact = false,
}: {
  projectName: string;
  onRename: (name: string) => void;
  onNewProject: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  playing: boolean;
  onTogglePlay: () => void;
  time: number;
  duration: number;
  saveState: StudioSaveState;
  cloudState?: "local" | "synced" | "error" | "conflict" | null;
  fps: number;
  format?: ProjectFormat;
  onChangeFormat?: (format: ProjectFormat) => void;
  onReloadRemote?: () => void;
  onKeepLocal?: () => void;
  /** Bouton d'export vidéo (rendu MP4), fourni par l'orchestrateur. */
  exportSlot?: React.ReactNode;
  /** Menu « Projets » (ouvrir / dupliquer / supprimer). */
  projectsSlot?: React.ReactNode;
  /** Écran étroit (< 1024 px) : barre resserrée, l'essentiel seulement. */
  compact?: boolean;
}) {
  return (
    <div className={`flex shrink-0 items-center justify-between border-b border-line bg-surface/60 ${compact ? "h-12 gap-1.5 px-2" : "h-14 px-4"}`}>
      <div className={`flex min-w-0 items-center ${compact ? "flex-1 gap-1.5" : "gap-4"}`}>
        <Link
          href="/"
          className={`${compact ? "hidden" : "inline-flex"} h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink`}
          aria-label="Retour au site"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <input
          value={projectName}
          onChange={(e) => onRename(e.target.value)}
          className={`${compact ? "w-0 min-w-0 flex-1 px-1 text-xs" : "w-56 px-2 text-sm"} rounded-lg border border-transparent bg-transparent font-semibold text-ink transition-colors hover:border-line focus:border-accent/60 focus:outline-none`}
          aria-label="Nom du projet"
          spellCheck={false}
        />
        {compact ? null : (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Studio · Bêta
          </span>
        )}
        {format && onChangeFormat ? (
          <select
            value={format}
            onChange={(e) => onChangeFormat(e.target.value as ProjectFormat)}
            className={`${compact ? "h-8 w-14 shrink-0 px-1 text-[11px]" : "h-8 px-2 text-xs"} cursor-pointer rounded-lg border border-line bg-background text-ink focus:border-accent/60 focus:outline-none`}
            aria-label="Format de la vidéo"
          >
            {(Object.keys(PROJECT_FORMATS) as ProjectFormat[]).map((key) => (
              <option key={key} value={key}>{compact ? key : PROJECT_FORMATS[key].label}</option>
            ))}
          </select>
        ) : null}
      </div>

      <div className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}>
        <button
          type="button"
          onClick={onTogglePlay}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-accent font-semibold text-white transition-colors hover:bg-accent/85 ${compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm"}`}
          aria-label={playing ? "Pause" : "Lecture"}
        >
          {playing ? (
            <span className="flex h-3.5 gap-0.5" aria-hidden="true">
              <span className="w-1 rounded-sm bg-white" />
              <span className="w-1 rounded-sm bg-white" />
            </span>
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="font-mono text-xs">
            {compact ? formatTimecode(time, fps).slice(0, 5) : `${formatTimecode(time, fps)} / ${formatTimecode(duration, fps)}`}
          </span>
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={`inline-flex ${compact ? "h-8 w-8" : "h-9 w-9"} cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted`}
          aria-label="Annuler (Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={`${compact ? "hidden" : "inline-flex h-9 w-9"} cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted`}
          aria-label="Rétablir (Cmd+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className={`mx-1 items-center gap-1.5 text-xs text-muted ${compact ? "hidden" : "hidden sm:flex"}`} aria-live="polite">
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Sauvegarde…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Enregistré
            </>
          ) : saveState === "error" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400" /> Échec de sauvegarde
            </>
          ) : null}
          {cloudState === "synced" ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300" title="Projets synchronisés Supabase (RLS)">
              Cloud ✓
            </span>
          ) : cloudState === "conflict" ? (
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300" role="alert">
              Modifié ailleurs
              <button type="button" onClick={onReloadRemote} className="cursor-pointer underline underline-offset-2 hover:text-amber-100">
                Recharger
              </button>
              ·
              <button type="button" onClick={onKeepLocal} className="cursor-pointer underline underline-offset-2 hover:text-amber-100">
                Garder la mienne
              </button>
            </span>
          ) : cloudState === "error" ? (
            <span className="ml-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300" title="Échec de synchronisation Supabase">
              Cloud ✕
            </span>
          ) : null}
        </span>

        {exportSlot}
        {projectsSlot}

        <button
          type="button"
          onClick={onNewProject}
          className="hidden h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink lg:inline-flex"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nouveau projet
        </button>
      </div>
    </div>
  );
}