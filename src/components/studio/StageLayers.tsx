"use client";

import type { CSSProperties } from "react";
import type { SceneTransitionType, StudioProject } from "@/lib/studio/project-model";
import { FRAME_SECONDS, roundToFrame, sceneIndexAtTime, sceneOffsets, transitionDurationOf } from "@/lib/studio/project-model";
import ControlledAnimation from "./ControlledAnimation";
import MediaLayer from "./MediaLayer";
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
}: {
  project: StudioProject;
  time: number;
  /** Conservés pour compatibilité : la sélection se fait désormais sur le canvas (StudioCanvas). */
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string) => void;
}) {
  const sceneIndex = sceneIndexAtTime(project, time);
  const offsets = sceneOffsets(project);
  const sceneStart = offsets[sceneIndex] ?? 0;
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const tDur = transitionDurationOf(project, sceneIndex);
  const inTransition = tDur > 0 && time - sceneStart < tDur && scene.transition;

  const current = (
    <SceneLayers
      project={project}
      sceneIndex={sceneIndex}
      time={time}
    />
  );
  if (!inTransition) return current;

  // Transition : la scène précédente reste figée sur sa dernière image, la
  // nouvelle arrive par-dessus (calculé depuis le temps → MP4 identique).
  const p = easeInOut(Math.min(1, Math.max(0, (time - sceneStart) / tDur)));
  return (
    <div className="absolute inset-0 overflow-hidden" data-canvas-surface="">
      <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
        <SceneLayers project={project} sceneIndex={sceneIndex - 1} time={sceneStart} endState />
      </div>
      <div className="absolute inset-0" style={transitionStyle(scene.transition!.type, p)} data-scene-transition={scene.transition!.type}>
        {current}
      </div>
    </div>
  );
}

function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function transitionStyle(type: SceneTransitionType, p: number): CSSProperties {
  switch (type) {
    case "fade":
      return { opacity: p };
    case "slide-left":
      return { transform: `translateX(${(1 - p) * 100}%)` };
    case "slide-up":
      return { transform: `translateY(${(1 - p) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    case "zoom":
      return { opacity: p, transform: `scale(${1.12 - 0.12 * p})` };
    default:
      return {};
  }
}

function SceneLayers({
  project,
  sceneIndex,
  time,
  endState = false,
}: {
  project: StudioProject;
  sceneIndex: number;
  time: number;
  /** État final de la scène (sous une transition) : chaque calque qui dure jusqu'à la fin, dans son état final. */
  endState?: boolean;
}) {
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const sceneStart = sceneOffsets(project)[sceneIndex] ?? 0;
  const active = endState
    ? scene.elements.filter((el) => !el.hidden && el.start + el.duration >= scene.duration - FRAME_SECONDS / 2)
    : scene.elements.filter((el) => !el.hidden && time >= sceneStart + el.start && time < sceneStart + el.start + el.duration);

  return (
    <div className="absolute inset-0" style={{ backgroundColor: scene.background ?? "#000000" }} data-canvas-surface="">
      {active.map((element, layer) => {
        const localTime = endState ? element.duration : roundToFrame(time - (sceneStart + element.start));
        // Logique « After Effects » : seul le calque le plus bas peint son fond ; les calques au-dessus
        // sont transparents, donc on voit tous les calques superposés en même temps.
        const fill = layer === 0 && element.kind !== "media" ? element.config.backgroundColor : "transparent";
        return (
          <div
            key={element.id}
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: layer + 1, backgroundColor: fill }}
            data-element-wrap=""
          >
            {/* Le fond reste fixe (plein cadre) ; seul le contenu se déplace, se redimensionne et pivote. */}
            <div
              className="absolute"
              data-element-layer={element.id}
              // L'échelle agit sur la mise en page (taille réelle du calque) et non sur un
              // transform : le texte est re-rendu à la bonne taille, donc net.
              style={{
                left: `${element.x - 50 * element.scale}%`,
                top: `${element.y - 50 * element.scale}%`,
                width: `${element.scale * 100}%`,
                height: `${element.scale * 100}%`,
                ...(element.rotation ? { transform: `rotate(${element.rotation}deg)` } : {}),
              }}
            >
              {element.kind === "media" ? (
                <MediaLayer element={element} asset={project.media.find((m) => m.id === element.media?.assetId)} localTime={localTime} />
              ) : (
                <ControlledAnimation
                  templateKey={element.templateKey as ComponentKey}
                  config={{ ...element.config, backgroundColor: "transparent" }}
                  localTime={localTime}
                  elementDuration={element.duration}
                  timing={element.timing}
                />
              )}
            </div>
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
  return scene.elements.filter((el) => !el.hidden && time >= sceneStart + el.start && time < sceneStart + el.start + el.duration).length;
}
