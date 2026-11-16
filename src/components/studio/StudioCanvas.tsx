"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { MousePointerClick, Play } from "lucide-react";
import type { StudioElement, StudioProject } from "@/lib/studio/project-model";
import { sceneOffsets } from "@/lib/studio/project-model";
import { supportsFontSize } from "@/lib/studio/typography";
import { boxCenter, localToStage, measureContentBox, placeContentAt, stageToLocal, wrapperCenter, type Box, type Pt } from "./canvas-geometry";
import StageLayers, { activeElementCount } from "./StageLayers";
import { ALIGN_EVENT, type AlignEdge } from "./align-events";
import { replaceSelection, selRange, wordAt, type TextEditState } from "@/lib/studio/text-edit";
import { supportsLetterColors } from "./LetterColors";
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
  textEdit = null,
  onTextEdit,
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
  /** Texte en cours d'édition sur la scène (curseur / sélection de lettres). */
  textEdit?: TextEditState | null;
  onTextEdit?: (state: TextEditState | null) => void;
  compact?: boolean;
}) {
  const [dropping, setDropping] = useState(false);
  const accepts = (e: DragEvent) => !!onDropTemplate && Array.from(e.dataTransfer.types).includes(TEMPLATE_DRAG_TYPE);
  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)];
  const ratio = project.width / project.height;
  const empty = activeElementCount(project, time) === 0;

  const stageRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const [editRects, setEditRects] = useState<{ sel: { l: number; t: number; w: number; h: number }[]; caret: { x: number; y: number; h: number } | null } | null>(null);
  const [measured, setMeasured] = useState<{ box: Box; scale: number; x: number; y: number; W: number; H: number; fs: number } | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const on = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const dragRef = useRef<{
    mode: "move" | "scale" | "rotate";
    /** Poignées d'angle : change la taille de police (templates texte) au lieu de l'échelle. */
    fontMode: boolean;
    fs0: number;
    id: string;
    start: Pt;
    xf: { x: number; y: number; scale: number; rotation: number };
    /** Centre du contenu par rapport au centre du calque, à l'échelle de départ (px, avant rotation). */
    v0: Pt;
    center0: Pt;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    // Un template en code a re-rendu : sa boîte de contenu a changé -> re-mesure (1 fois par image).
    const stage = stageRef.current;
    if (!stage) return;
    let raf = 0;
    const on = () => {
      if (dragRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setResizeTick((n) => n + 1));
    };
    stage.addEventListener("mg-content-box", on);
    // La scène change de taille (bandeau fx, panneaux, fenêtre) : la boîte de sélection
    // doit être re-mesurée, d'abord tout de suite puis une fois le contenu remis en page.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      on();
      clearTimeout(timer);
      timer = setTimeout(on, 150);
    });
    ro.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      stage.removeEventListener("mg-content-box", on);
    };
  }, []);

  const sceneStart = sceneOffsets(project)[Math.min(sceneIndex, project.scenes.length - 1)] ?? 0;
  const activeEls = scene.elements.filter((el) => !el.hidden && time >= sceneStart + el.start && time < sceneStart + el.start + el.duration);
  const selected = activeEls.find((el) => el.id === selectedElementId) ?? null;
  const editing = textEdit && selected && textEdit.id === selected.id && onTextEdit ? textEdit : null;

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
    setMeasured(layer ? { box: measureContentBox(layer, stage), scale: selected.scale, x: selected.x, y: selected.y, W: stage.clientWidth, H: stage.clientHeight, fs: selected.config.fontSize ?? 1 } : null);
  }, [selected, time, playing, project, findLayer, resizeTick, dragging]);

  // « Aligner sur la page » (panneau droit) : on décale le calque pour que la boîte
  // visible du contenu (pivotée comprise) touche le bord ou le centre de la scène.
  useEffect(() => {
    const onAlign = (ev: Event) => {
      const stage = stageRef.current;
      const { id, edge } = (ev as CustomEvent<{ id: string; edge: AlignEdge }>).detail;
      if (!stage || !selected || selected.id !== id || !measured || !onPatchElement) return;
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const cur = displayBox(measured, selected);
      const xf = { x: selected.x, y: selected.y, scale: selected.scale, rotation: selected.rotation ?? 0 };
      const pts = [
        { x: cur.l, y: cur.t },
        { x: cur.r, y: cur.t },
        { x: cur.r, y: cur.b },
        { x: cur.l, y: cur.b },
      ].map((p) => localToStage(p, xf, W, H));
      const l = Math.min(...pts.map((p) => p.x));
      const r = Math.max(...pts.map((p) => p.x));
      const t = Math.min(...pts.map((p) => p.y));
      const b = Math.max(...pts.map((p) => p.y));
      let dx = 0;
      let dy = 0;
      if (edge === "left") dx = -l;
      else if (edge === "right") dx = W - r;
      else if (edge === "hcenter") dx = W / 2 - (l + r) / 2;
      else if (edge === "top") dy = -t;
      else if (edge === "bottom") dy = H - b;
      else dy = H / 2 - (t + b) / 2;
      onPatchElement(id, { x: Math.round((selected.x + (dx / W) * 100) * 100) / 100, y: Math.round((selected.y + (dy / H) * 100) * 100) / 100 });
    };
    window.addEventListener(ALIGN_EVENT, onAlign);
    return () => window.removeEventListener(ALIGN_EVENT, onAlign);
  }, [selected, measured, onPatchElement]);

  // Rectangles de la sélection de lettres et position du curseur (mesurés sur le texte rendu).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const layer = editing ? findLayer(editing.id) : null;
    if (!stage || !editing || !layer) {
      setEditRects(null);
      return;
    }
    const sr = stage.getBoundingClientRect();
    const boxes = letterBoxes(layer);
    const [a, b] = selRange(editing);
    const sel = boxes
      .filter((x) => x.index >= a && x.index < b)
      .map((x) => ({ l: x.r.left - sr.left, t: x.r.top - sr.top, w: x.r.width, h: x.r.height }));
    let caret: { x: number; y: number; h: number } | null = null;
    const at = boxes.find((x) => x.index === editing.focus);
    const before = boxes.find((x) => x.index === editing.focus - 1);
    if (at) caret = { x: at.r.left - sr.left, y: at.r.top - sr.top, h: at.r.height };
    else if (before) caret = { x: before.r.right - sr.left, y: before.r.top - sr.top, h: before.r.height };
    setEditRects({ sel, caret });
  }, [editing, project, time, resizeTick, findLayer]);

  // Clavier pendant l'édition : saisie, effacement, flèches, Cmd+A, Échap / Entrée pour sortir.
  useEffect(() => {
    if (!editing || !selected || !onPatchElement || !onTextEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const config = selected.config;
      const len = config.text.length;
      const [a, b] = selRange(editing);
      const put = (insert: string, del: "back" | "fwd" | null = null) => {
        let edit = editing;
        if (a === b && del === "back") edit = { ...editing, anchor: Math.max(0, a - 1), focus: a };
        if (a === b && del === "fwd") edit = { ...editing, anchor: a, focus: Math.min(len, a + 1) };
        const r = replaceSelection(config, edit, insert);
        onPatchElement(selected.id, { config: r.config });
        onTextEdit({ id: selected.id, anchor: r.caret, focus: r.caret });
      };
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) onTextEdit(null);
      else if (e.key === "Enter") put("\n");
      else if (meta && e.key.toLowerCase() === "a") onTextEdit({ id: selected.id, anchor: 0, focus: len });
      else if (meta) return; // Cmd+Z, Cmd+C… : laissés au Studio / navigateur
      else if (e.key === "Backspace") put("", "back");
      else if (e.key === "Delete") put("", "fwd");
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const f = e.shiftKey ? Math.max(0, Math.min(len, editing.focus + dir)) : a !== b ? (dir < 0 ? a : b) : Math.max(0, Math.min(len, editing.focus + dir));
        onTextEdit({ id: selected.id, anchor: e.shiftKey ? editing.anchor : f, focus: f });
      } else if (e.key.length === 1) put(e.key);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing, selected, onPatchElement, onTextEdit]);

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
      fontMode: mode === "scale" && supportsFontSize(el.templateKey, el.kind),
      fs0: el.config.fontSize ?? 1,
      id: el.id,
      start: stagePoint(e),
      xf,
      v0: { x: bc.x - c.x, y: bc.y - c.y },
      center0: localToStage(bc, xf, W, H),
    };
    setMeasured({ box: cur, scale: el.scale, x: el.x, y: el.y, W, H, fs: el.config.fontSize ?? 1 });
    setDragging(true);
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onStagePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (editing && onTextEdit) {
      const layer = findLayer(editing.id);
      const i = layer ? caretAt(layer, e.clientX, e.clientY) : null;
      if (i !== null) {
        // Clic dans le texte : place le curseur (Maj : étend la sélection), glisser = sélectionner.
        e.preventDefault();
        selectingRef.current = true;
        stageRef.current?.setPointerCapture(e.pointerId);
        onTextEdit({ id: editing.id, anchor: e.shiftKey ? editing.anchor : i, focus: i });
        return;
      }
      onTextEdit(null);
    }
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
      const m = { box: b, scale: el.scale, x: el.x, y: el.y, W, H, fs: el.config.fontSize ?? 1 };
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
    if (selectingRef.current && editing && onTextEdit) {
      const layer = findLayer(editing.id);
      const i = layer ? caretAt(layer, e.clientX, e.clientY, 400) : null;
      if (i !== null && i !== editing.focus) onTextEdit({ ...editing, focus: i });
      return;
    }
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
      if (d.fontMode) {
        // Les poignées pilotent la taille de police ; l'échelle reste réglable à la main (curseur).
        const el = activeEls.find((x) => x.id === d.id);
        if (!el) return;
        const fontSize = Math.round(Math.max(0.3, Math.min(3, d.fs0 * (d1 / d0))) * 100) / 100;
        onPatchElement(d.id, { config: { ...el.config, fontSize } });
      } else {
        const scale = Math.round(Math.max(0.2, Math.min(3, d.xf.scale * (d1 / d0))) * 100) / 100;
        const k = scale / d.xf.scale;
        const pos = placeContentAt({ x: d.v0.x * k, y: d.v0.y * k }, d.center0, d.xf.rotation, W, H);
        onPatchElement(d.id, { scale, x: clampPct(pos.x), y: clampPct(pos.y) });
      }
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
    selectingRef.current = false;
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
          onDoubleClick={(e) => {
            // Double-clic sur le texte sélectionné : édition sur place (comme dans Canva).
            if (!selected || !onTextEdit || !supportsLetterColors(selected.templateKey)) return;
            const layer = findLayer(selected.id);
            const i = layer ? caretAt(layer, e.clientX, e.clientY) : null;
            if (i === null) return;
            const [a, b] = wordAt(selected.config.text, Math.min(i, selected.config.text.length - 1));
            onTextEdit({ id: selected.id, anchor: a, focus: b });
          }}
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
          {editing && editRects ? <TextEditOverlay rects={editRects} /> : null}
          {selected && measured && !playing ? <SelectionOverlay editing={!!editing} element={selected} box={displayBox(measured, selected)} /> : null}
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
function displayBox(m: { box: Box; scale: number; x: number; y: number; W: number; H: number; fs: number }, el: StudioElement, W = m.W, H = m.H): Box {
  const k = el.scale / m.scale;
  const c0 = wrapperCenter({ x: m.x, y: m.y, scale: m.scale }, W, H);
  const c1 = wrapperCenter({ x: el.x, y: el.y, scale: el.scale }, W, H);
  let l = c1.x + (m.box.l - c0.x) * k;
  let t = c1.y + (m.box.t - c0.y) * k;
  let r = c1.x + (m.box.r - c0.x) * k;
  let b = c1.y + (m.box.b - c0.y) * k;
  // Taille de police modifiée pendant un glissement : le contenu grossit autour de son centre.
  const fk = (el.config.fontSize ?? 1) / m.fs;
  if (Math.abs(fk - 1) > 1e-6) {
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    l = cx + (l - cx) * fk;
    r = cx + (r - cx) * fk;
    t = cy + (t - cy) * fk;
    b = cy + (b - cy) * fk;
  }
  return { l, t, r, b, full: m.box.full };
}

/** Boîte de sélection : pivotée autour du centre du calque, poignées à taille constante. */
/** Sélection de lettres et curseur clignotant, dessinés par-dessus le texte en édition. */
function TextEditOverlay({ rects }: { rects: { sel: { l: number; t: number; w: number; h: number }[]; caret: { x: number; y: number; h: number } | null } }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[99]" aria-hidden="true">
      {rects.sel.map((r, i) => (
        <span key={i} className="absolute rounded-[2px] bg-[#0A84FF]/40" style={{ left: r.l, top: r.t, width: r.w, height: r.h }} />
      ))}
      {rects.caret ? (
        <span className="absolute w-[2px] animate-pulse bg-white shadow-[0_0_0_1px_rgba(10,132,255,0.8)]" style={{ left: rects.caret.x - 1, top: rects.caret.y, height: rects.caret.h }} />
      ) : null}
    </div>
  );
}

/** Lettres du calque (data-ci = position dans le texte) et leur boîte écran. */
function letterBoxes(layer: HTMLElement): { index: number; r: DOMRect }[] {
  return Array.from(layer.querySelectorAll<HTMLElement>("[data-ci]"))
    .map((el) => ({ index: Number(el.dataset.ci), r: el.getBoundingClientRect() }))
    .filter((x) => Number.isFinite(x.index) && x.r.height > 0);
}

/** Position du curseur (entre deux lettres) la plus proche d'un point écran ; null si loin du texte. */
function caretAt(layer: HTMLElement, x: number, y: number, pad = 14): number | null {
  const boxes = letterBoxes(layer);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.r.left)) - pad;
  const maxX = Math.max(...boxes.map((b) => b.r.right)) + pad;
  const minY = Math.min(...boxes.map((b) => b.r.top)) - pad;
  const maxY = Math.max(...boxes.map((b) => b.r.bottom)) + pad;
  if (x < minX || x > maxX || y < minY || y > maxY) return null;
  // Ligne la plus proche verticalement, puis lettre la plus proche horizontalement.
  const dy = (b: { r: DOMRect }) => (y < b.r.top ? b.r.top - y : y > b.r.bottom ? y - b.r.bottom : 0);
  const best = Math.min(...boxes.map(dy));
  const line = boxes.filter((b) => dy(b) - best < 2).sort((a, b) => a.r.left - b.r.left);
  for (const b of line) if (x < b.r.left + b.r.width / 2) return b.index;
  return line[line.length - 1].index + 1;
}

function SelectionOverlay({ element, box, editing = false }: { element: StudioElement; box: Box; editing?: boolean }) {
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
      <div className="absolute" style={{ left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t, outline: editing ? "1px dashed rgba(10,132,255,0.8)" : "2px solid rgba(10,132,255,0.9)" }}>
        {editing ? null : (<>
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
        </>)}
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
