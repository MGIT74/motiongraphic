"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { MousePointerClick, Play } from "lucide-react";
import type { StudioElement, StudioProject } from "@/lib/studio/project-model";
import { sceneOffsets } from "@/lib/studio/project-model";
import { boxCenter, localToStage, measureContentBox, placeContentAt, stageToLocal, wrapperCenter, type Box, type Pt } from "./canvas-geometry";
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
  onPatchElement,
  onDropTemplate,
  compact = false,
}: {
  project: StudioProject;
  time: number;
  playing: boolean;
  sceneIndex: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  /** Modification directe (glisser, redimensionner, pivoter) de l'élément sélectionné. */
  onPatchElement?: (elementId: string, patch: Partial<StudioElement>) => void;
  /** Template déposé depuis la bibliothèque (ajouté à l'instant courant). */
  onDropTemplate?: (templateKey: string) => void;
  compact?: boolean;
}) {
  const [dropping, setDropping] = useState(false);
  const accepts = (e: DragEvent) => !!onDropTemplate && Array.from(e.dataTransfer.types).includes(TEMPLATE_DRAG_TYPE);
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const ratio = project.width / project.height;
  const empty = activeElementCount(project, time) === 0;

  const stageRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ box: Box; scale: number; x: number; y: number; W: number; H: number } | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const on = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const dragRef = useRef<{
    mode: "move" | "scale" | "rotate";
    id: string;
    start: Pt;
    xf: { x: number; y: number; scale: number; rotation: number };
    /** Centre du contenu par rapport au centre du calque, à l'échelle de départ (px, avant rotation). */
    v0: Pt;
    center0: Pt;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const sceneStart = sceneOffsets(project)[Math.min(sceneIndex, project.scenes.length - 1)] ?? 0;
  const activeEls = scene.elements.filter((el) => !el.hidden && time >= sceneStart + el.start && time < sceneStart + el.start + el.duration);
  const selected = activeEls.find((el) => el.id === selectedElementId) ?? null;

  const findLayer = useCallback((id: string) => stageRef.current?.querySelector<HTMLElement>(`[data-element-layer="${id}"]`) ?? null, []);

  // Boîte du contenu de l'élément sélectionné (au repos : recalculée à chaque changement).
  useLayoutEffect(() => {
    if (dragRef.current) return;
    const stage = stageRef.current;
    if (!stage || !selected || playing) {
      setMeasured(null);
      return;
    }
    const layer = findLayer(selected.id);
    setMeasured(layer ? { box: measureContentBox(layer, stage), scale: selected.scale, x: selected.x, y: selected.y, W: stage.clientWidth, H: stage.clientHeight } : null);
  }, [selected, time, playing, project, findLayer, resizeTick]);

  const stagePoint = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beginDrag = (mode: "move" | "scale" | "rotate", el: StudioElement, m: NonNullable<typeof measured>, e: RPointerEvent) => {
    const stage = stageRef.current!;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const xf = { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation ?? 0 };
    // Boîte mesurée à (m.x, m.y, m.scale) : on la ramène à l'état courant de l'élément.
    const cur = displayBox(m, el);
    const c = wrapperCenter(xf, W, H);
    const bc = boxCenter(cur);
    dragRef.current = {
      mode,
      id: el.id,
      start: stagePoint(e),
      xf,
      v0: { x: bc.x - c.x, y: bc.y - c.y },
      center0: localToStage(bc, xf, W, H),
    };
    setMeasured({ box: cur, scale: el.scale, x: el.x, y: el.y, W, H });
    setDragging(true);
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onStagePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage || !onPatchElement) {
      const target = e.target as HTMLElement;
      if (target === e.currentTarget || target.dataset.canvasSurface !== undefined) onSelectElement(null);
      return;
    }
    const handle = (e.target as HTMLElement).dataset.handle;
    if (handle && selected && measured) {
      beginDrag(handle === "rot" ? "rotate" : "scale", selected, measured, e);
      return;
    }
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const q = stagePoint(e);
    const pad = 8;
    let hit: { el: StudioElement; m: NonNullable<typeof measured> } | null = null;
    let fallback: { el: StudioElement; m: NonNullable<typeof measured> } | null = null;
    for (let i = activeEls.length - 1; i >= 0; i--) {
      const el = activeEls[i];
      const layer = findLayer(el.id);
      if (!layer) continue;
      const b = measureContentBox(layer, stage);
      const p = stageToLocal(q, { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation }, W, H);
      const inside = p.x >= b.l - pad && p.x <= b.r + pad && p.y >= b.t - pad && p.y <= b.b + pad;
      if (!inside) continue;
      const m = { box: b, scale: el.scale, x: el.x, y: el.y, W, H };
      if (b.full) fallback ??= { el, m };
      else {
        hit = { el, m };
        break;
      }
    }
    const picked = hit ?? fallback;
    if (!picked) {
      onSelectElement(null);
      return;
    }
    onSelectElement(picked.el.id);
    if (!playing) beginDrag("move", picked.el, picked.m, e);
  };

  const onStagePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || !stage || !onPatchElement) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const q = stagePoint(e);
    const clampPct = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
    if (d.mode === "move") {
      let px = d.center0.x + (q.x - d.start.x);
      let py = d.center0.y + (q.y - d.start.y);
      const snap = !e.shiftKey;
      const thr = 6;
      const gv = snap && Math.abs(px - W / 2) < thr;
      const gh = snap && Math.abs(py - H / 2) < thr;
      if (gv) px = W / 2;
      if (gh) py = H / 2;
      setGuides({ v: gv, h: gh });
      const pos = placeContentAt(d.v0, { x: px, y: py }, d.xf.rotation, W, H);
      onPatchElement(d.id, { x: clampPct(pos.x), y: clampPct(pos.y) });
    } else if (d.mode === "scale") {
      const d0 = Math.hypot(d.start.x - d.center0.x, d.start.y - d.center0.y) || 1;
      const d1 = Math.hypot(q.x - d.center0.x, q.y - d.center0.y);
      const scale = Math.round(Math.max(0.2, Math.min(3, d.xf.scale * (d1 / d0))) * 100) / 100;
      const k = scale / d.xf.scale;
      const pos = placeContentAt({ x: d.v0.x * k, y: d.v0.y * k }, d.center0, d.xf.rotation, W, H);
      onPatchElement(d.id, { scale, x: clampPct(pos.x), y: clampPct(pos.y) });
    } else {
      const a0 = Math.atan2(d.start.y - d.center0.y, d.start.x - d.center0.x);
      const a1 = Math.atan2(q.y - d.center0.y, q.x - d.center0.x);
      let rot = d.xf.rotation + ((a1 - a0) * 180) / Math.PI;
      rot = ((((rot + 180) % 360) + 360) % 360) - 180;
      if (!e.altKey) {
        const nearest = Math.round(rot / 15) * 15;
        if (Math.abs(rot - nearest) < 3) rot = nearest;
      }
      rot = Math.max(-180, Math.min(180, Math.round(rot)));
      const pos = placeContentAt(d.v0, d.center0, rot, W, H);
      onPatchElement(d.id, { rotation: rot, x: clampPct(pos.x), y: clampPct(pos.y) });
    }
  };

  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setGuides({ v: false, h: false });
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-surface/30">
      {/* Zone disponible (container queries) : le cadre y tient entièrement, quel que soit le format. */}
      <div className={`absolute ${compact ? "inset-2" : "inset-6"} flex items-center justify-center`} style={{ containerType: "size" }}>
        <div
          ref={stageRef}
          className="relative touch-none select-none overflow-hidden rounded-2xl border border-line shadow-[0_40px_120px_-60px_rgba(10,132,255,0.35)]"
          style={{
            aspectRatio: `${project.width} / ${project.height}`,
            width: `min(100cqw, calc(100cqh * ${ratio}), 1000px)`,
          }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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
          />
          {selected && measured && !playing ? <SelectionOverlay element={selected} box={displayBox(measured, selected)} /> : null}
          {guides.v ? <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[97] w-px bg-fuchsia-400/80" aria-hidden="true" /> : null}
          {guides.h ? <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[97] h-px bg-fuchsia-400/80" aria-hidden="true" /> : null}
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

/** Boîte mesurée à (x, y, scale) ramenée à l'état courant de l'élément (le contenu suit l'échelle autour du centre du calque). */
function displayBox(m: { box: Box; scale: number; x: number; y: number; W: number; H: number }, el: StudioElement, W = m.W, H = m.H): Box {
  const k = el.scale / m.scale;
  const c0 = wrapperCenter({ x: m.x, y: m.y, scale: m.scale }, W, H);
  const c1 = wrapperCenter({ x: el.x, y: el.y, scale: el.scale }, W, H);
  return {
    l: c1.x + (m.box.l - c0.x) * k,
    t: c1.y + (m.box.t - c0.y) * k,
    r: c1.x + (m.box.r - c0.x) * k,
    b: c1.y + (m.box.b - c0.y) * k,
    full: m.box.full,
  };
}

/** Boîte de sélection : pivotée autour du centre du calque, poignées à taille constante. */
function SelectionOverlay({ element, box }: { element: StudioElement; box: Box }) {
  const handle = 11;
  const corner = (id: string, left: string, top: string, cursor: string) => (
    <span
      key={id}
      data-handle={id}
      className="absolute rounded-sm border border-white bg-accent"
      style={{ left, top, width: handle, height: handle, marginLeft: -handle / 2, marginTop: -handle / 2, cursor, pointerEvents: "auto", touchAction: "none" }}
    />
  );
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[98]"
      style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined, transformOrigin: `${element.x}% ${element.y}%` }}
      aria-hidden="true"
    >
      <div className="absolute" style={{ left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t, outline: "2px solid rgba(10,132,255,0.9)" }}>
        <span className="absolute left-1/2 bg-accent" style={{ top: -26, width: 1.5, height: 26, marginLeft: -0.75 }} />
        <span
          data-handle="rot"
          className="absolute rounded-full border border-white bg-accent"
          style={{ left: "50%", top: -26, width: handle * 1.2, height: handle * 1.2, marginLeft: -handle * 0.6, marginTop: -handle * 0.6, cursor: "grab", pointerEvents: "auto", touchAction: "none" }}
        />
        {corner("nw", "0%", "0%", "nwse-resize")}
        {corner("ne", "100%", "0%", "nesw-resize")}
        {corner("sw", "0%", "100%", "nesw-resize")}
        {corner("se", "100%", "100%", "nwse-resize")}
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
