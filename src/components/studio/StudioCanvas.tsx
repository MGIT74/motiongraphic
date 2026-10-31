"use client";

import { useMemo, type MouseEvent } from "react";
import { MousePointerClick, Play } from "lucide-react";
import type { StudioProject } from "@/lib/studio/project-model";
import { roundToFrame } from "@/lib/studio/project-model";
import ControlledAnimation from "./ControlledAnimation";
import type { ComponentKey } from "@/types/animation";

/**
 * Canvas central : cadre 16:9 (1920×1080) montrant la scène à l'instant
 * courant. Chaque élément actif est rendu par son composant d'animation,
 * piloté par le temps (scrub + lecture). Sélection par clic.
 */
export default function StudioCanvas({
  project,
  time,
  playing,
  sceneIndex,
  selectedElementId,
  onSelectElement,
}: {
  project: StudioProject;
  time: number;
  playing: boolean;
  sceneIndex: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
}) {
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const sceneStart = useMemo(() => {
    let offset = 0;
    for (let i = 0; i < Math.min(sceneIndex, project.scenes.length - 1); i += 1) {
      offset += project.scenes[i].duration;
    }
    return offset;
  }, [project, sceneIndex]);

  const activeElements = scene.elements.filter(
    (el) => time >= sceneStart + el.start && time < sceneStart + el.start + el.duration
  );

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface/30 p-6">
      <div
        className="relative w-full max-w-[min(100%,1000px)] overflow-hidden rounded-2xl border border-line bg-black shadow-[0_40px_120px_-60px_rgba(10,132,255,0.35)]"
        style={{ aspectRatio: `${project.width} / ${project.height}` }}
        onMouseDown={(e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (target === e.currentTarget || target.dataset.canvasSurface !== undefined) {
            onSelectElement(null);
          }
        }}
        aria-label={`Aperçu — scène ${scene.name}`}
      >
        {activeElements.length === 0 ? <EmptyState playing={playing} /> : null}

        {activeElements.map((element) => {
          const localTime = roundToFrame(time - (sceneStart + element.start));
          const isSelected = element.id === selectedElementId;
          return (
            <div
              key={element.id}
              className="absolute inset-0 cursor-pointer"
              style={{
                transform: `translate(${element.x - 50}%, ${element.y - 50}%) scale(${element.scale})`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelectElement(element.id);
              }}
            >
              <ControlledAnimation
                templateKey={element.templateKey as ComponentKey}
                config={element.config}
                localTime={localTime}
              />
              {isSelected ? (
                <span
                  className="pointer-events-none absolute inset-4 z-10 rounded-2xl border-2 border-accent/60"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          );
        })}

        <div
          className="pointer-events-none absolute left-3 top-3 z-20 rounded-full border border-line bg-black/60 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted backdrop-blur-sm"
          aria-hidden="true"
        >
          {scene.name} · {sceneIndex + 1}/{project.scenes.length}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ playing }: { playing: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" data-canvas-surface="">
      <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line px-8 py-8 text-center">
        {playing ? (
          <Play className="h-5 w-5 text-muted" aria-hidden="true" />
        ) : (
          <MousePointerClick className="h-5 w-5 text-muted" aria-hidden="true" />
        )}
        <p className="text-xs text-muted">Aucun élément à cet instant de la timeline.</p>
        <p className="max-w-64 text-[11px] leading-relaxed text-muted/70">
          Déplacez le curseur temporel ou ajoutez un élément depuis la
          bibliothèque (panneau gauche).
        </p>
      </div>
    </div>
  );
}