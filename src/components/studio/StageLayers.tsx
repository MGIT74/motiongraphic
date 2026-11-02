"use client";

import type { StudioProject } from "@/lib/studio/project-model";
import { roundToFrame, sceneIndexAtTime, sceneOffsets } from "@/lib/studio/project-model";
import ControlledAnimation from "./ControlledAnimation";
import type { ComponentKey } from "@/types/animation";

/**
 * Rendu d'une scène à un instant donné : fond de scène + calques actifs
 * (le premier élément au fond, le dernier au premier plan). Partagé par le
 * canvas du Studio et la page de rendu vidéo (/render) — même moteur,
 * même image.
 */
export default function StageLayers({
  project,
  time,
  selectedElementId,
  onSelectElement,
}: {
  project: StudioProject;
  time: number;
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string) => void;
}) {
  const sceneIndex = sceneIndexAtTime(project, time);
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const sceneStart = sceneOffsets(project)[sceneIndex] ?? 0;
  const active = scene.elements.filter(
    (el) => time >= sceneStart + el.start && time < sceneStart + el.start + el.duration
  );

  return (
    <div className="absolute inset-0" style={{ backgroundColor: scene.background ?? "#000000" }} data-canvas-surface="">
      {active.map((element, layer) => {
        const localTime = roundToFrame(time - (sceneStart + element.start));
        const isSelected = element.id === selectedElementId;
        return (
          <div
            key={element.id}
            className={onSelectElement ? "absolute inset-0 cursor-pointer" : "absolute inset-0"}
            style={{
              zIndex: layer + 1,
              transform: `translate(${element.x - 50}%, ${element.y - 50}%) scale(${element.scale})`,
              // Un calque transparent ne capte pas les clics hors de son contenu visible.
              pointerEvents: onSelectElement ? "auto" : "none",
            }}
            onMouseDown={
              onSelectElement
                ? (e) => {
                    e.stopPropagation();
                    onSelectElement(element.id);
                  }
                : undefined
            }
          >
            <ControlledAnimation
              templateKey={element.templateKey as ComponentKey}
              config={element.config}
              localTime={localTime}
              elementDuration={element.duration}
              timing={element.timing}
            />
            {isSelected ? (
              <span className="pointer-events-none absolute inset-4 z-10 rounded-2xl border-2 border-accent/60" aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Éléments actifs à l'instant t (pour l'état vide du canvas). */
export function activeElementCount(project: StudioProject, time: number): number {
  const sceneIndex = sceneIndexAtTime(project, time);
  const scene = project.scenes[sceneIndex];
  const sceneStart = sceneOffsets(project)[sceneIndex] ?? 0;
  return scene.elements.filter((el) => time >= sceneStart + el.start && time < sceneStart + el.start + el.duration).length;
}
