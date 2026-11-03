"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCcw } from "lucide-react";
import { friendlyError } from "@/lib/studio/errors";
import { useToasts } from "./Toasts";

type ExportState =
  | { kind: "idle" }
  | { kind: "running"; renderId: string; progress: number }
  | { kind: "done"; url: string }
  | { kind: "error"; message: string };

/**
 * Export MP4 depuis le Studio : enregistre le projet dans le cloud, lance le
 * rendu serveur, affiche la progression puis le lien de téléchargement.
 */
export default function ExportButton({
  projectId,
  beforeExport,
  compact = false,
}: {
  projectId: string;
  /** Sauvegarde cloud préalable (le rendu lit la version enregistrée). */
  beforeExport: () => Promise<boolean>;
  compact?: boolean;
}) {
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const toasts = useToasts();
  const fail = (message: string) => {
    setState({ kind: "error", message });
    toasts.error(message, "export", () => void start());
  };
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = async () => {
    setState({ kind: "running", renderId: "", progress: 0 });
    if (!(await beforeExport())) {
      fail("Connectez-vous : l'export nécessite la sauvegarde cloud.");
      return;
    }
    let res: Response;
    try {
      res = await fetch("/api/studio/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { render_id?: string; error?: string };
    if (!res.ok || !body.render_id) {
      fail(body.error ?? `Erreur ${res.status}`);
      return;
    }
    const renderId = body.render_id;
    setState({ kind: "running", renderId, progress: 0 });
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/studio/render/${renderId}`).catch(() => null);
      const s = (await r?.json().catch(() => null)) as { status?: string; progress?: number; url?: string | null; error?: string | null } | null;
      if (!s) return;
      if (s.status === "done" && s.url) {
        if (timer.current) clearInterval(timer.current);
        const url = s.url;
        setState({ kind: "done", url });
        toasts.success("Votre vidéo est prête", "Le MP4 est disponible pendant 7 jours.", {
          label: "Télécharger",
          run: () => {
            window.location.href = url;
          },
        });
      } else if (s.status === "error") {
        if (timer.current) clearInterval(timer.current);
        fail(s.error ?? "Erreur de rendu.");
      } else {
        setState({ kind: "running", renderId, progress: s.progress ?? 0 });
      }
    }, 1500);
  };

  const base =
    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors";

  if (state.kind === "running") {
    return (
      <span className={`${base} cursor-default border-accent/40 text-accent`} aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {state.renderId ? (compact ? `${state.progress} %` : `Rendu ${state.progress} %`) : compact ? "…" : "Préparation…"}
      </span>
    );
  }
  if (state.kind === "done") {
    return (
      <span className="inline-flex items-center gap-1">
        <a href={state.url} className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`} download>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> {compact ? "MP4" : "Télécharger le MP4"}
        </a>
        <button type="button" onClick={() => setState({ kind: "idle" })} className={`${base} border-line text-muted hover:text-ink`} aria-label="Nouvel export">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {state.kind === "error" && !compact ? (
        <span className="max-w-56 truncate text-[11px] text-red-300" title={state.message}>
          {friendlyError(state.message, "export").title}
        </span>
      ) : null}
      <button type="button" onClick={() => void start()} className={`${base} border-line text-ink hover:border-accent/50`} aria-label="Exporter MP4">
        <Film className="h-3.5 w-3.5" aria-hidden="true" /> {compact ? <span className="sr-only">Exporter MP4</span> : "Exporter MP4"}
      </button>
    </span>
  );
}
