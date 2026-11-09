"use client";

import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { MousePointerClick, Play } from "lucide-react";
import type { StudioElement, StudioProject } from "@/lib/studio/project-model";
import { sceneOffsets } from "@/lib/studio/project-model";
import { boxCenter, localToStage, measureContentBox, placeLocalPointAt, stageToLocal, type Box, type Pt } from "./canvas-geometry";
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
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const dragRef = useRef<{
    mode: "move" | "scale" | "rotate";
    id: string;
    start: Pt;
    xf: { x: number; y: number; scale: number; rotation: number };
    box: Box;
    center0: Pt;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const sceneStart = sceneOffsets(project)[Math.min(sceneIndex, project.scenes.length - 1)] ?? 0;
  const activeEls = scene.elements.filter((el) => time >= sceneStart + el.start && time < sceneStart + el.start + el.duration);
  const selected = activeEls.find((el) => el.id === selectedElementId) ?? null;

  const findLayer = useCallback((id: string) => stageRef.current?.querySelector<HTMLElement>(`[data-element-layer="${id}"]`) ?? null, []);

  // Boîte du contenu de l'élément sélectionné (au repos : recalculée à chaque changement).
  useLayoutEffect(() => {
    if (dragRef.current) return;
    const stage = stageRef.current;
    if (!stage || !selected || playing) {
      setBox(null);
      return;
    }
    const layer = findLayer(selected.id);
    setBox(layer ? measureContentBox(layer, stage) : null);
  }, [selected, time, playing, project, findLayer]);

  const stagePoint = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beginDrag = (mode: "move" | "scale" | "rotate", el: StudioElement, b: Box, e: RPointerEvent) => {
    const stage = stageRef.current!;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const xf = { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation ?? 0 };
    dragRef.current = {
      mode,
      id: el.id,
      start: stagePoint(e),
      xf,
      box: b,
      center0: localToStage(boxCenter(b), xf, W, H),
    };
    setBox(b);
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
    if (handle && selected && box) {
      beginDrag(handle === "rot" ? "rotate" : "scale", selected, box, e);
      return;
    }
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const q = stagePoint(e);
    const pad = 8;
    let hit: { el: StudioElement; box: Box } | null = null;
    let fallback: { el: StudioElement; box: Box } | null = null;
    for (let i = activeEls.length - 1; i >= 0; i--) {
      const el = activeEls[i];
      const layer = findLayer(el.id);
      if (!layer) continue;
      const b = el.id === selected?.id && box ? box : measureContentBox(layer, stage);
      const p = stageToLocal(q, { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation }, W, H);
      const inside = p.x >= b.l - pad && p.x <= b.r + pad && p.y >= b.t - pad && p.y <= b.b + pad;
      if (!inside) continue;
      if (b.full) fallback ??= { el, box: b };
      else {
        hit = { el, box: b };
        break;
      }
    }
    const picked = hit ?? fallback;
    if (!picked) {
      onSelectElement(null);
      return;
    }
    onSelectElement(picked.el.id);
    if (!playing) beginDrag("move", picked.el, picked.box, e);
  };

  const onStagePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || !stage || !onPatchElement) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const q = stagePoint(e);
    const bc = boxCenter(d.box);
    const clampPct = (v: number) => Math.max(0, Math.min(100, v));
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
      const pos = placeLocalPointAt(bc, { x: px, y: py }, d.xf.scale, d.xf.rotation, W, H);
      onPatchElement(d.id, { x: Math.round(clampPct(pos.x) * 10) / 10, y: Math.round(clampPct(pos.y) * 10) / 10 });
    } else if (d.mode === "scale") {
      const d0 = Math.hypot(d.start.x - d.center0.x, d.start.y - d.center0.y) || 1;
      const d1 = Math.hypot(q.x - d.center0.x, q.y - d.center0.y);
      const scale = Math.round(Math.max(0.2, Math.min(3, d.xf.scale * (d1 / d0))) * 100) / 100;
      const pos = placeLocalPointAt(bc, d.center0, scale, d.xf.rotation, W, H);
      onPatchElement(d.id, { scale, x: Math.round(clampPct(pos.x) * 10) / 10, y: Math.round(clampPct(pos.y) * 10) / 10 });
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
      const pos = placeLocalPointAt(bc, d.center0, d.xf.scale, rot, W, H);
      onPatchElement(d.id, { rotation: rot, x: Math.round(clampPct(pos.x) * 10) / 10, y: Math.round(clampPct(pos.y) * 10) / 10 });
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
          {selected && box && !playing ? <SelectionOverlay element={selected} box={box} dragging={dragging} /> : null}
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

/** Boîte de sélection : suit exactement la transformation du calque (déplacement, échelle, rotation). */
function SelectionOverlay({ element, box, dragging }: { element: StudioElement; box: Box; dragging: boolean }) {
  const k = 1 / element.scale; // épaisseurs/poignées constantes à l'écran
  const handle = 11 * k;
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
      style={{ transform: `translate(${element.x - 50}%, ${element.y - 50}%) scale(${element.scale})${element.rotation ? ` rotate(${element.rotation}deg)` : ""}` }}
      aria-hidden="true"
    >
      <div
        className="absolute"
        style={{
          left: box.l,
          top: box.t,
          width: box.r - box.l,
          height: box.b - box.t,
          outline: `${2 * k}px solid rgba(10,132,255,0.9)`,
        }}
      >
        <span className="absolute left-1/2 bg-accent" style={{ top: -26 * k, width: 1.5 * k, height: 26 * k, marginLeft: -0.75 * k }} />
        <span
          data-handle="rot"
          className="absolute rounded-full border border-white bg-accent"
          style={{ left: "50%", top: -26 * k, width: handle * 1.2, height: handle * 1.2, marginLeft: -handle * 0.6, marginTop: -handle * 0.6, cursor: "grab", pointerEvents: "auto", touchAction: "none" }}
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
