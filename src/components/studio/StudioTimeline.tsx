"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from "react";
import { AudioLines, Film, Image as ImageIcon, Magnet, Minus, Plus, Trash2 } from "lucide-react";
import type { StudioElement, StudioProject } from "@/lib/studio/project-model";
import { roundToFrame, sceneOffsets } from "@/lib/studio/project-model";
import { TEMPLATE_DRAG_TYPE } from "./TemplateLibrary";

const LANE_PX = 48;
const ZOOM_MIN = 24;
const ZOOM_MAX = 240;
const DEFAULT_ZOOM = 72;
/** Distance (px) en dessous de laquelle un bord s'aimante à un repère. */
const SNAP_PX = 8;
/** Déplacement (px) avant qu'un clic devienne un glissement. */
const DRAG_THRESHOLD_PX = 3;

type DragMode = "move" | "trim-start" | "trim-end";

interface DragState {
  elementId: string;
  mode: DragMode;
  start: number;
  duration: number;
  /** Repère d'aimantation actif (temps global), pour la ligne guide. */
  guide: number | null;
}

/**
 * Timeline : règle temporelle, scènes, pistes Motion (animations) et Médias
 * (images, vidéos) de la scène courante, piste Audio, curseur.
 *
 * Glisser-déposer : seuil anti-clic, aimantation (curseur, bords de scène,
 * autres calques, secondes ; Alt pour désactiver) avec ligne guide, poignées
 * de début et de fin, info-bulle début/durée, zoom (boutons ou Ctrl + molette),
 * dépôt d'un template de la bibliothèque à l'instant visé.
 */
export default function StudioTimeline({
  project,
  time,
  duration,
  sceneIndex,
  selectedElementId,
  onSelectElement,
  onSeek,
  onChangeTiming,
  onDeleteElement,
  onDropTemplate,
}: {
  project: StudioProject;
  time: number;
  duration: number;
  sceneIndex: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  onSeek: (time: number) => void;
  /** Début et/ou durée d'un élément (temps relatifs à sa scène). */
  /** `gesture` : identifiant du glissement en cours (une étape d'annulation par glissement). */
  onChangeTiming: (sceneId: string, elementId: string, timing: { start: number; duration: number }, gesture: number) => void;
  onDeleteElement: (elementId: string) => void;
  /** Template déposé depuis la bibliothèque à l'instant global `time`. */
  onDropTemplate?: (templateKey: string, time: number) => void;
}) {
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_ZOOM);
  const [snapOn, setSnapOn] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const offsets = useMemo(() => sceneOffsets(project), [project]);
  const scene = project.scenes[sceneIndex];
  const sceneOffset = offsets[sceneIndex] ?? 0;
  const sceneElements = useMemo(() => scene?.elements ?? [], [scene]);
  const motionElements = useMemo(() => sceneElements.filter((el) => el.kind !== "media"), [sceneElements]);
  const mediaElements = useMemo(() => sceneElements.filter((el) => el.kind === "media"), [sceneElements]);
  const motionLanes = useMemo(() => assignLanes(motionElements), [motionElements]);
  const mediaLanes = useMemo(() => assignLanes(mediaElements), [mediaElements]);

  const motionPx = motionLanes.count * LANE_PX + 8;
  const mediaPx = mediaLanes.count * LANE_PX + 8;
  const motionTop = 44; // sous la règle (32px) + marge
  const mediaTop = motionTop + motionPx + 8;
  const audioTop = mediaTop + mediaPx + 8;
  const totalPx = audioTop + 60;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef(0);
  const width = Math.max(duration + 2, 8) * pxPerSec;

  /** Convertit une position pointeur en temps timeline. */
  const timeFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(duration, (clientX - rect.left) / pxPerSec));
    },
    [duration, pxPerSec]
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

  /** Clic dans une zone vide des pistes : place le curseur et désélectionne. */
  const onEmptyTrackDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    onSelectElement(null);
    scrub(e.clientX);
  };

  /* --------------------------- zoom (Ctrl + molette) --------------------------- */
  const zoomBy = (factor: number) => setPxPerSec((z) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor))));
  const onWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  /* ------------------------------- aimantation -------------------------------- */
  /** Repères (temps relatifs à la scène) pour l'élément `exceptId`. */
  const snapPoints = (exceptId: string): number[] => {
    if (!scene) return [];
    const pts = [0, scene.duration, roundToFrame(time - sceneOffset)];
    for (const el of sceneElements) {
      if (el.id === exceptId) continue;
      pts.push(el.start, el.start + el.duration);
    }
    for (let s = 1; s < scene.duration; s++) pts.push(s);
    return pts;
  };
  /** Aimante `value` au repère le plus proche (sous SNAP_PX) ; renvoie aussi le repère. */
  const snapValue = (value: number, points: number[], enabled: boolean): { value: number; guide: number | null } => {
    if (!enabled) return { value, guide: null };
    let best: number | null = null;
    let bestDist = SNAP_PX / pxPerSec;
    for (const p of points) {
      const d = Math.abs(p - value);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best === null ? { value, guide: null } : { value: best, guide: best };
  };

  /* ------------------------------ glisser élément ---------------------------- */
  const startElementDrag = (e: PointerEvent, element: StudioElement, mode: DragMode) => {
    if (!scene || e.button !== 0) return;
    e.stopPropagation();
    onSelectElement(element.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const points = snapPoints(element.id);
    const sceneId = scene.id;
    const maxStart = Math.max(0, scene.duration - 0.2);
    let moved = false;
    let last = { start: element.start, duration: element.duration };
    const gesture = ++gestureRef.current;
    // eslint-disable-next-line react-hooks/immutability -- confiné au gestionnaire de glissement
    document.body.style.userSelect = "none";

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX) return;
      moved = true;
      const delta = (ev.clientX - startX) / pxPerSec;
      const snapping = snapOn && !ev.altKey;
      let start = element.start;
      let dur = element.duration;
      let guide: number | null = null;

      if (mode === "move") {
        const raw = Math.max(0, Math.min(maxStart, element.start + delta));
        // Le début ou la fin s'aimante, selon le repère le plus proche.
        const byStart = snapValue(raw, points, snapping);
        const byEnd = snapValue(raw + element.duration, points, snapping);
        if (byStart.guide !== null && (byEnd.guide === null || Math.abs(byStart.value - raw) <= Math.abs(byEnd.value - raw - element.duration))) {
          start = byStart.value;
          guide = byStart.guide;
        } else if (byEnd.guide !== null) {
          start = byEnd.value - element.duration;
          guide = byEnd.guide;
        } else {
          start = raw;
        }
        start = Math.max(0, Math.min(maxStart, start));
      } else if (mode === "trim-end") {
        const end = snapValue(element.start + Math.max(0.5, element.duration + delta), points, snapping);
        dur = Math.max(0.5, Math.min(120, end.value - element.start));
        guide = end.guide;
      } else {
        const end = element.start + element.duration;
        const s = snapValue(Math.max(0, Math.min(end - 0.5, element.start + delta)), points, snapping);
        start = Math.max(0, Math.min(end - 0.5, s.value));
        dur = end - start;
        guide = s.guide;
      }
      last = { start: roundToFrame(start), duration: roundToFrame(dur) };
      setDrag({ elementId: element.id, mode, ...last, guide });
      onChangeTiming(sceneId, element.id, last, gesture);
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      setDrag(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void last;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ------------------------ dépôt depuis la bibliothèque ----------------------- */
  const acceptsTemplate = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TEMPLATE_DRAG_TYPE);
  const onDragOver = (e: DragEvent) => {
    if (!onDropTemplate || !acceptsTemplate(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropAt(roundToFrame(timeFromEvent(e.clientX)));
  };
  const onDrop = (e: DragEvent) => {
    if (!onDropTemplate || !acceptsTemplate(e)) return;
    e.preventDefault();
    const key = e.dataTransfer.getData(TEMPLATE_DRAG_TYPE);
    setDropAt(null);
    if (key) onDropTemplate(key, roundToFrame(timeFromEvent(e.clientX)));
  };

  const renderBlock = (element: StudioElement, lane: number, isMedia: boolean) => {
    const selected = element.id === selectedElementId;
    const active = drag?.elementId === element.id ? drag : null;
    const start = active ? active.start : element.start;
    const dur = active ? active.duration : element.duration;
    const overflow = scene ? Math.max(0, start + dur - scene.duration) : 0;
    const blockWidth = Math.max(28, dur * pxPerSec);
    const tone = isMedia
      ? selected
        ? "border-violet-400 bg-violet-500/30 text-white"
        : "border-violet-500/30 bg-violet-500/10 text-violet-200/80 hover:border-violet-400/60"
      : selected
        ? "border-accent bg-accent/25 text-white"
        : "border-line bg-elevated text-muted hover:border-accent/40";
    return (
      <div
        key={element.id}
        className={`group absolute flex touch-none items-center overflow-hidden rounded-lg border-2 text-[10px] font-semibold uppercase tracking-wider ${active ? "z-20 shadow-lg" : "transition-colors"} ${tone}`}
        style={{
          left: (sceneOffset + start) * pxPerSec,
          width: blockWidth,
          top: 4 + lane * LANE_PX,
          height: LANE_PX - 6,
          cursor: active ? "grabbing" : "grab",
        }}
        onPointerDown={(event: PointerEvent) => startElementDrag(event, element, "move")}
        onDoubleClick={() => onSeek(roundToFrame(sceneOffset + element.start + 0.05))}
        role="button"
        tabIndex={0}
        aria-label={`Élément ${element.label} — ${element.duration}s`}
        title={`${element.label} — début ${fmt(element.start)} s, durée ${fmt(element.duration)} s (double-clic : aller au début)`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelectElement(element.id);
        }}
        data-element-kind={isMedia ? "media" : "motion"}
      >
        {/* Poignée de début */}
        <span
          className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize bg-white/10 opacity-60 hover:bg-white/30 group-hover:opacity-100"
          onPointerDown={(event) => startElementDrag(event, element, "trim-start")}
          aria-label="Début — glisser pour changer le début"
          data-trim="start"
        />
        {isMedia ? <ImageIcon className="ml-3.5 h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        <span className={`truncate ${isMedia ? "px-1.5" : "pl-4 pr-2"}`}>{element.label}</span>
        {/* Partie au-delà de la fin de la scène : coupée à l'export */}
        {overflow > 0 ? (
          <span
            className="pointer-events-none absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.35)_0_4px,transparent_4px_8px)]"
            style={{ width: Math.min(blockWidth, overflow * pxPerSec) }}
            title="Au-delà de la fin de la scène : non visible"
          />
        ) : null}
        {/* Poignée de fin */}
        <span
          className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize bg-white/10 opacity-60 hover:bg-white/30 group-hover:opacity-100"
          onPointerDown={(event) => startElementDrag(event, element, "trim-end")}
          aria-label="Trim droit — glisser pour changer la durée"
          data-trim="end"
        />
        <span
          className="absolute right-4 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-red-300 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDeleteElement(element.id)}
          title="Supprimer l'élément (Suppr)"
        >
          <Trash2 className="pointer-events-none h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    );
  };

  const draggedTooltip = drag ? (
    <span
      className="pointer-events-none absolute z-40 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 font-mono text-[10px] text-white shadow-lg"
      style={{ left: (sceneOffset + drag.start + drag.duration / 2) * pxPerSec, top: 6 }}
      data-drag-tooltip
    >
      {drag.mode === "trim-end" ? `Durée ${fmt(drag.duration)} s` : drag.mode === "trim-start" ? `Début ${fmt(drag.start)} s · durée ${fmt(drag.duration)} s` : `Début ${fmt(drag.start)} s → fin ${fmt(drag.start + drag.duration)} s`}
    </span>
  ) : null;

  const lanes = [
    { id: "motion", label: "Motion", icon: Film, height: motionPx + 12 },
    { id: "media", label: "Médias", icon: ImageIcon, height: mediaPx + 12 },
    { id: "audio", label: "Audio", icon: AudioLines, height: 60 },
  ];

  return (
    <div className="relative shrink-0 border-t border-line bg-surface/60" style={{ height: Math.min(totalPx, 360) }}>
      {/* Outils : zoom + aimantation */}
      <div className="absolute right-3 top-1 z-40 flex items-center gap-1 rounded-full border border-line bg-surface/95 px-1 py-0.5 shadow">
        <button type="button" onClick={() => setSnapOn((v) => !v)} className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 text-[10px] font-medium ${snapOn ? "bg-accent/15 text-accent" : "text-muted hover:text-ink"}`} aria-pressed={snapOn} title="Aimantation (maintenir Alt pour la suspendre)">
          <Magnet className="h-3 w-3" aria-hidden="true" /> Aimant
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted hover:text-ink" aria-label="Dézoomer la timeline">
          <Minus className="h-3 w-3" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setPxPerSec(DEFAULT_ZOOM)} className="h-6 cursor-pointer rounded-full px-1 font-mono text-[10px] text-muted hover:text-ink" title="Zoom par défaut (Ctrl + molette pour zoomer)">
          {Math.round((pxPerSec / DEFAULT_ZOOM) * 100)} %
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted hover:text-ink" aria-label="Zoomer la timeline">
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <div className="relative h-full overflow-x-auto overflow-y-auto" onWheel={onWheel}>
        <div className="flex min-w-max" style={{ height: totalPx }}>
          {/* Colonne des labels de pistes */}
          <div className="sticky left-0 z-30 w-28 shrink-0 border-r border-line bg-surface">
            <div className="flex h-8 items-center border-b border-line px-3 font-mono text-[10px] text-muted">
              TL · {project.scenes.length} scènes
            </div>
            {lanes.map((lane) => (
              <div key={lane.id} className="flex items-center gap-2 border-b border-line/50 px-3" style={{ height: lane.height }}>
                <lane.icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span className="text-[11px] font-medium text-ink/80">{lane.label}</span>
              </div>
            ))}
          </div>

          {/* Zone temporelle */}
          <div
            className="relative"
            style={{ width: `${width}px` }}
            ref={trackRef}
            onDragOver={onDragOver}
            onDragLeave={() => setDropAt(null)}
            onDrop={onDrop}
          >
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
              {rulerTicks(duration, pxPerSec).map((s) => (
                <span
                  key={`tick-${s}`}
                  className="pointer-events-none absolute top-0 flex h-full items-end whitespace-nowrap pb-1 font-mono text-[9px] text-muted/80"
                  style={{ left: `${s * pxPerSec}px` }}
                >
                  <span className="mr-1 inline-block h-2 w-px bg-line" />
                  {s}s
                </span>
              ))}
            </div>

            {/* Marqueurs de scènes (fond de piste) — clic = curseur */}
            {project.scenes.map((sc, i) => (
              <div
                key={`scene-mark-${sc.id}`}
                className={`absolute border-l-2 border-line ${i === sceneIndex ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]"}`}
                style={{ left: offsets[i] * pxPerSec, width: sc.duration * pxPerSec, top: 36, bottom: 0 }}
                onPointerDown={onEmptyTrackDown}
              >
                <span className="pointer-events-none absolute -left-0 top-1 z-10 rounded-r-full bg-elevated px-2 py-[2px] font-mono text-[9px] text-muted">
                  {sc.name}
                </span>
              </div>
            ))}

            {/* Piste Motion : animations de la scène courante */}
            <div className="pointer-events-none absolute" style={{ top: motionTop, height: motionPx, left: 0, right: 0 }}>
              <div className="pointer-events-auto">{motionElements.map((el) => renderBlock(el, motionLanes.map.get(el.id) ?? 0, false))}</div>
              {motionElements.length === 0 ? (
                <span className="absolute top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted/50" style={{ left: sceneOffset * pxPerSec + 10 }}>
                  Glissez un template ici
                </span>
              ) : null}
            </div>

            {/* Piste Médias : images et vidéos de la scène courante */}
            <div className="pointer-events-none absolute border-y border-line/30" style={{ top: mediaTop, height: mediaPx, left: 0, right: 0 }}>
              <div className="pointer-events-auto">{mediaElements.map((el) => renderBlock(el, mediaLanes.map.get(el.id) ?? 0, true))}</div>
              {mediaElements.length === 0 ? (
                <span className="absolute top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted/50" style={{ left: sceneOffset * pxPerSec + 10 }}>
                  Images et vidéos : onglet Médias
                </span>
              ) : null}
            </div>

            {/* Piste Audio : musique du projet */}
            <div className="pointer-events-none text-muted/40" style={{ position: "absolute", top: audioTop, height: 56, left: 0, right: 0 }}>
              {project.audio ? (() => {
                const audio = project.audio;
                const asset = project.media.find((m) => m.id === audio.assetId);
                const length = Math.max(0.5, Math.min((asset?.duration ?? duration) - audio.trimStart, duration - audio.start));
                return (
                  <span
                    className="absolute flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-semibold text-emerald-200"
                    style={{ left: audio.start * pxPerSec, width: length * pxPerSec, top: 6, height: 44 }}
                    title={asset?.name ?? "Musique"}
                  >
                    ♪ <span className="truncate">{asset?.name ?? "Musique"}</span>
                  </span>
                );
              })() : (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[9px]">Musique : onglet Médias</span>
              )}
            </div>

            {/* Ligne guide d'aimantation */}
            {drag?.guide !== null && drag?.guide !== undefined ? (
              <span
                className="pointer-events-none absolute bottom-0 z-30 w-px bg-amber-300"
                style={{ left: (sceneOffset + drag.guide) * pxPerSec, top: 32 }}
                aria-hidden="true"
                data-snap-guide
              />
            ) : null}
            {draggedTooltip}

            {/* Indicateur de dépôt d'un template */}
            {dropAt !== null ? (
              <span className="pointer-events-none absolute bottom-0 z-30 w-0.5 bg-emerald-400" style={{ left: dropAt * pxPerSec, top: 0 }} aria-hidden="true">
                <span className="absolute left-1 top-9 whitespace-nowrap rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-black">
                  + {fmt(dropAt)} s
                </span>
              </span>
            ) : null}

            {/* Playhead */}
            <Playhead time={time} pxPerSec={pxPerSec} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Calques qui se chevauchent : une ligne par superposition (attribution gloutonne). */
function assignLanes(elements: StudioElement[]): { map: Map<string, number>; count: number } {
  const ends: number[] = [];
  const map = new Map<string, number>();
  for (const el of elements) {
    let lane = ends.findIndex((end) => end <= el.start + 1e-6);
    if (lane === -1) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = el.start + el.duration;
    map.set(el.id, lane);
  }
  return { map, count: Math.max(1, ends.length) };
}

/** Graduations lisibles quel que soit le zoom. */
function rulerTicks(duration: number, pxPerSec: number): number[] {
  const step = pxPerSec >= 48 ? 1 : pxPerSec >= 28 ? 2 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(duration) + 1; s += step) ticks.push(s);
  return ticks;
}

function fmt(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function Playhead({ time, pxPerSec }: { time: number; pxPerSec: number }) {
  return (
    <span className="pointer-events-none absolute bottom-0 z-30 w-[2px] bg-accent" style={{ left: time * pxPerSec, top: 0 }} aria-hidden="true">
      <span className="absolute -left-[4px] -top-[2px] h-2.5 w-2.5 rotate-45 bg-accent" />
    </span>
  );
}
