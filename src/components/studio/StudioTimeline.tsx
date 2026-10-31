"use client";

import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { AudioLines, Film, Layers3, Trash2 } from "lucide-react";
import type { StudioProject } from "@/lib/studio/project-model";
import { roundToFrame, sceneOffsets } from "@/lib/studio/project-model";

const LANES = [
  { id: "motion", label: "Motion", icon: Film, active: true },
  { id: "media", label: "Rushs", icon: Layers3, active: true },
  { id: "audio", label: "Audio", icon: AudioLines, active: true },
] as const;

/**
 * Timeline bas : règle temporelle + scènes + éléments animés (drag/resize),
 * playhead scrubbable. Les pistes Rushs/Audio affichent les scènes en
 * attente de la Phase 3 (import réel) — aucune fausse fonctionnalité.
 */
export default function StudioTimeline({
  project,
  time,
  duration,
  sceneIndex,
  selectedElementId,
  onSelectElement,
  onSeek,
  onMoveElement,
  onResizeElement,
  onDeleteElement,
}: {
  project: StudioProject;
  time: number;
  duration: number;
  sceneIndex: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  onSeek: (time: number) => void;
  onMoveElement: (sceneId: string, elementId: string, start: number) => void;
  onResizeElement: (sceneId: string, elementId: string, duration: number) => void;
  onDeleteElement: (elementId: string) => void;
}) {
  const offsets = useMemo(() => sceneOffsets(project), [project]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pxPerSec = 72;
  const width = Math.max(duration, 8) * pxPerSec;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** Convertit un évènement pointeur en temps timeline. */
  const timeFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(duration, (clientX - rect.left) / pxPerSec));
    },
    [duration]
  );

  const scrub = (clientX: number) => onSeek(roundToFrame(timeFromEvent(clientX)));

  const onPlayheadDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    scrub(e.clientX);
    const onMove = (ev: globalThis.PointerEvent) => scrub(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ------------------------------ drag élément ---------------------------- */
  const startElementDrag = (
    e: PointerEvent,
    sceneId: string,
    elementId: string,
    mode: "move" | "resize",
    elementStart: number,
    elementDuration: number
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    // Le linter réagit statiquement à cette mutation : elle est pourtant
    // confinée au gestionnaire d'événement de drag (valide et sûre).
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.userSelect = "none";

    const onMove = (ev: globalThis.PointerEvent) => {
      const deltaSec = roundToFrame((ev.clientX - startX) / pxPerSec);
      if (mode === "move") {
        const nextStart = Math.max(0, Math.min(elementStart + deltaSec, 600));
        onMoveElement(sceneId, elementId, nextStart);
      } else {
        const nextDuration = Math.max(0.5, Math.min(elementDuration + deltaSec, 120));
        onResizeElement(sceneId, elementId, nextDuration);
      }
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="h-56 shrink-0 border-t border-line bg-surface/60">
      {/* En-têtes de pistes + piste */}
      <div ref={scrollRef} className="relative h-full overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max">
          {/* Colonne des labels de pistes */}
          <div className="w-28 shrink-0 border-r border-line bg-surface/80">
            <div className="flex h-8 items-center border-b border-line px-3 font-mono text-[10px] text-muted">
              TL · {project.scenes.length} scènes
            </div>
            {LANES.map((lane) => (
              <div key={lane.id} className="flex h-14 items-center gap-2 border-b border-line/50 px-3">
                <lane.icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span className="text-[11px] font-medium text-ink/80">{lane.label}</span>
                {lane.id !== "motion" ? (
                  <span className="ml-auto rounded-full border border-line px-1.5 py-[1px] text-[9px] text-muted">P3</span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Zone temporelle */}
          <div className="relative" style={{ width: `${width}px` }} ref={trackRef}>
            {/* Règle temporelle */}
            <div
              className="relative h-8 cursor-ew-resize border-b border-line"
              onPointerDown={onPlayheadDown}
              role="slider"
              aria-label="Curseur temporel"
              aria-valuenow={Math.round(time * 100) / 100}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
            >
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, s) => (
                <span
                  key={`tick-${s}`}
                  className="absolute top-0 flex h-full items-end whitespace-nowrap pb-1 font-mono text-[9px] text-muted/80"
                  style={{ left: `${s * pxPerSec}px` }}
                >
                  <span className="mr-1 inline-block h-2 w-px bg-line" />
                  {s}s
                </span>
              ))}
            </div>

            {/* Marqueurs de scènes (fond de piste) */}
            {project.scenes.map((scene, i) => (
              <div
                key={`scene-mark-${scene.id}`}
                className={`absolute border-l-2 border-line ${i === sceneIndex ? "bg-accent/[0.06]" : ""}`}
                style={{ left: offsets[i] * pxPerSec, width: scene.duration * pxPerSec, top: "2.45rem", bottom: 0 }}
              >
                <span className="absolute -left-0 top-1 z-10 rounded-r-full bg-elevated px-2 py-[2px] font-mono text-[9px] text-muted">
                  {scene.name}
                </span>
              </div>
            ))}

            {/* Piste Motion : éléments de la scène courante */}
            <div className="absolute" style={{ top: "2.75rem", height: "3.5rem", left: 0, right: 0 }}>
              {(project.scenes[sceneIndex]?.elements ?? []).map((element) => {
                const selected = element.id === selectedElementId;
                return (
                  <div
                    key={element.id}
                    className={`absolute flex items-center overflow-hidden rounded-lg border-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      selected
                        ? "border-accent bg-accent/25 text-white"
                        : "border-line bg-elevated text-muted hover:border-accent/40"
                    }`}
                    style={{
                      left: element.start * pxPerSec,
                      width: Math.max(28, element.duration * pxPerSec),
                      top: 4,
                      height: 44,
                    }}
                    onPointerDown={(event: PointerEvent) => startElementDrag(event, project.scenes[sceneIndex].id, element.id, "move", element.start, element.duration)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Élément ${element.label} — ${element.duration}s`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onSelectElement(element.id);
                      }
                    }}
                  >
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-white/20" />
                    <span className="truncate px-2">{element.label}</span>
                    <span
                      className="pointer-events-auto absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-white/10"
                      onPointerDown={(event) => startElementDrag(event, project.scenes[sceneIndex].id, element.id, "resize", element.start, element.duration)}
                      onDoubleClick={() => onDeleteElement(element.id)}
                      aria-label="Trim droit — double-clic pour supprimer l'élément"
                    />
                    <span
                      className="absolute right-1 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-red-300 opacity-0 transition-opacity hover:opacity-100"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onDeleteElement(element.id)}
                      title="Supprimer l'élément"
                    >
                      <Trash2 className="pointer-events-none h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Piste Rushs — attente Phase 3 */}
            <div className="absolute border-y border-line/30" style={{ top: "6.5rem", height: "3.5rem", left: 0, right: 0 }}>
              {project.scenes.map((scene, si) => (
                <span
                  key={`media-${scene.id}`}
                  className="absolute bg-gradient-to-r from-elevated to-surface text-[9px] text-muted/60"
                  style={{ left: offsets[si] * pxPerSec + 2, width: scene.duration * pxPerSec - 4, top: 6, height: 40 }}
                >
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono uppercase">Rush · {scene.name}</span>
                </span>
              ))}
            </div>

            {/* Piste Audio — attente Phase 3 */}
            <div
              className="text-muted/40"
              style={{ position: "absolute", top: "10.25rem", height: "3.5rem", left: 0, right: 0 }}
            >
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[9px]">
                Audio — Phase 3
              </span>
            </div>

            {/* Playhead */}
            <Playhead time={time} pxPerSec={pxPerSec} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Playhead({ time, pxPerSec }: { time: number; pxPerSec: number }) {
  return (
    <span
      className="pointer-events-none absolute bottom-0 z-30 w-[2px] bg-accent"
      style={{ left: time * pxPerSec, top: 0 }}
      aria-hidden="true"
    >
      <span className="absolute -left-[4px] -top-[2px] h-2.5 w-2.5 rotate-45 bg-accent" />
    </span>
  );
}