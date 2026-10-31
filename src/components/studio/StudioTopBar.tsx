"use client";

import Link from "next/link";
import { ArrowLeft, Check, Loader2, Play, Plus, Redo2, Undo2 } from "lucide-react";
import { STUDIO_FPS } from "@/lib/studio/project-model";

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
  fps,
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
  fps: number;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/60 px-4">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          aria-label="Retour au site"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <input
          value={projectName}
          onChange={(e) => onRename(e.target.value)}
          className="w-56 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink transition-colors hover:border-line focus:border-accent/60 focus:outline-none"
          aria-label="Nom du projet"
          spellCheck={false}
        />
        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Studio · Bêta
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
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
            {formatTimecode(time, fps)} / {formatTimecode(duration, fps)}
          </span>
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
          aria-label="Annuler (Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
          aria-label="Rétablir (Cmd+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="mx-1 hidden items-center gap-1.5 text-xs text-muted sm:flex" aria-live="polite">
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
        </span>

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