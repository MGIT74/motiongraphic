"use client";

import { useState, type DragEvent, type MouseEvent } from "react";
import { MousePointerClick, Play } from "lucide-react";
import type { StudioProject } from "@/lib/studio/project-model";
import StageLayers, { activeElementCount } from "./StageLayers";
import { TEMPLATE_DRAG_TYPE } from "./TemplateLibrary";

/**
 * Canvas central : cadre au format du projet (16:9, 9:16 ou 1:1) montrant la
 * scène à l'instant courant — fond de scène + calques superposés, pilotés par
 * la timeline (scrub + lecture). Sélection par clic sur un calque.
 */
export default function StudioCanvas({
  project,
  time,
  playing,
  sceneIndex,
  selectedElementId,
  onSelectElement,
  onDropTemplate,
  compact = false,
}: {
  project: StudioProject;
  time: number;
  playing: boolean;
  sceneIndex: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  /** Template déposé depuis la bibliothèque (ajouté à l'instant courant). */
  onDropTemplate?: (templateKey: string) => void;
  compact?: boolean;
}) {
  const [dropping, setDropping] = useState(false);
  const accepts = (e: DragEvent) => !!onDropTemplate && Array.from(e.dataTransfer.types).includes(TEMPLATE_DRAG_TYPE);
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const ratio = project.width / project.height;
  const empty = activeElementCount(project, time) === 0;

  return (
    <div className="relative flex-1 overflow-hidden bg-surface/30">
      {/* Zone disponible (container queries) : le cadre y tient entièrement, quel que soit le format. */}
      <div className={`absolute ${compact ? "inset-2" : "inset-6"} flex items-center justify-center`} style={{ containerType: "size" }}>
        <div
          className="relative overflow-hidden rounded-2xl border border-line shadow-[0_40px_120px_-60px_rgba(10,132,255,0.35)]"
          style={{
            aspectRatio: `${project.width} / ${project.height}`,
            width: `min(100cqw, calc(100cqh * ${ratio}), 1000px)`,
          }}
          onMouseDown={(e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target === e.currentTarget || target.dataset.canvasSurface !== undefined) {
              onSelectElement(null);
            }
          }}
          aria-label={`Aperçu — scène ${scene.name}`}
          data-studio-canvas
          onDragOver={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            setDropping(false);
            const key = e.dataTransfer.getData(TEMPLATE_DRAG_TYPE);
            if (key) onDropTemplate?.(key);
          }}
        >
          <StageLayers
            project={project}
            time={time}
            selectedElementId={selectedElementId}
            onSelectElement={(id) => onSelectElement(id)}
          />
          {empty ? <EmptyState playing={playing} /> : null}
          {dropping ? (
            <div className="pointer-events-none absolute inset-0 z-[101] flex items-center justify-center border-2 border-dashed border-emerald-400 bg-emerald-400/10">
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-black">Déposer ici : ajouté à l&apos;instant du curseur</span>
            </div>
          ) : null}

          <div
            className="pointer-events-none absolute left-3 top-3 z-[100] rounded-full border border-line bg-black/60 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted backdrop-blur-sm"
            aria-hidden="true"
          >
            {scene.name} · {sceneIndex + 1}/{project.scenes.length}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ playing }: { playing: boolean }) {
  return (
    <div className="absolute inset-0 z-[99] flex items-center justify-center" data-canvas-surface="">
      <div className="pointer-events-none flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line px-8 py-8 text-center">
        {playing ? (
          <Play className="h-5 w-5 text-muted" aria-hidden="true" />
        ) : (
          <MousePointerClick className="h-5 w-5 text-muted" aria-hidden="true" />
        )}
        <p className="text-xs text-muted">Aucun élément à cet instant de la timeline.</p>
        <p className="max-w-64 text-[11px] leading-relaxed text-muted/70">
          Déplacez le curseur temporel, ou glissez un template de la
          bibliothèque (onglet Templates) jusqu&apos;ici.
        </p>
      </div>
    </div>
  );
}
