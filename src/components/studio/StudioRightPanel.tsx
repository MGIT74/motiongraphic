"use client";

import { useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Check, Eye, EyeOff, GripVertical, Sparkles, X, Move, MousePointerClick as MousePointerClickIcon, Palette, Timer, Trash2, Type } from "lucide-react";
import { requestAlign, type AlignEdge } from "@/components/studio/align-events";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import { supportsFontSize } from "@/lib/studio/typography";
import type { ElementTiming, MediaOptions, StudioElement, StudioProject, StudioScene } from "@/lib/studio/project-model";
import { getStudioTemplate, templatesForKind } from "@/lib/studio/template-registry";
import LoopingDemoFrame from "@/components/studio/LoopingDemoFrame";
import type { ComponentKey } from "@/types/animation";

export interface StudioSelection {
  element: StudioElement;
  scene: StudioScene;
  sceneIndex: number;
}

/**
 * Panneau droit du Studio : propriétés de l'élément sélectionné + galerie
 * des animations compatibles (aperçus animés en direct) pour le
 * remplacement instantané de style.
 */
export default function StudioRightPanel({
  project,
  selection,
  onChangeTemplate,
  onPatchElement,
  onDeleteElement,
  onMoveLayer,
  fxOpen = false,
  onToggleFx,
  onSelectElement,
  variant = "sidebar",
}: {
  project: StudioProject;
  selection: StudioSelection | null;
  /** sidebar = colonne de droite (≥ 1024 px) ; sheet = panneau glissant mobile. */
  variant?: "sidebar" | "sheet";
  time?: number;
  /** Bouton « fx » : ouvre / ferme la galerie de styles sur la scène. */
  fxOpen?: boolean;
  onToggleFx?: () => void;
  onSelectElement?: (elementId: string) => void;
  onChangeTemplate: (elementId: string, newTemplateKey: string) => void;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveLayer?: (elementId: string, target: "up" | "down" | "front" | "back" | number) => void;
}) {
  return (
    <aside
      className={
        variant === "sheet"
          ? "flex w-full flex-col"
          : "hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface/40 lg:flex xl:w-80"
      }
    >
      {selection === null ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-2.5 text-center text-muted">
            <MousePointerClickIcon className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs leading-relaxed">
              Sélectionnez un élément sur le canvas ou la timeline pour éditer
              ses propriétés et changer son style.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ElementProperties selection={selection} onPatchElement={onPatchElement} onDeleteElement={onDeleteElement} onMoveLayer={onMoveLayer} fxOpen={fxOpen} onToggleFx={onToggleFx} onSelectElement={onSelectElement} />
          {variant === "sheet" && fxOpen && selection.element.kind !== "media" ? (
            <CompatibleStyles
              element={selection.element}
              project={project}
              onChange={onChangeTemplate}
            />
          ) : null}
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Propriétés de l'élément sélectionné                                  */
/* ------------------------------------------------------------------ */

type PanelTab = "style" | "spacing" | "position" | "animation";

function ElementProperties({
  selection,
  onPatchElement,
  onDeleteElement,
  onMoveLayer,
  fxOpen,
  onToggleFx,
  onSelectElement,
}: {
  onSelectElement?: (elementId: string) => void;
  fxOpen: boolean;
  onToggleFx?: () => void;
  selection: StudioSelection;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveLayer?: (elementId: string, target: "up" | "down" | "front" | "back" | number) => void;
}) {
  const { element, scene } = selection;
  const template = getStudioTemplate(element.templateKey);
  const config = element.config;
  const isMedia = element.kind === "media";
  const hasTypo = supportsFontSize(element.templateKey, element.kind);
  const [tab, setTab] = useState<PanelTab>(isMedia ? "position" : "style");

  const tabs: { id: PanelTab; label: string; Icon: typeof Type }[] = [
    ...(isMedia ? [] : [{ id: "style" as const, label: "Style", Icon: Palette }]),
    ...(hasTypo ? [{ id: "spacing" as const, label: "Espacement", Icon: Baseline }] : []),
    { id: "position", label: "Position", Icon: Move },
    { id: "animation", label: isMedia ? "Média" : "Animation", Icon: Timer },
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  const inputCls =
    "h-9 w-full rounded-lg border border-line bg-background px-2.5 text-xs text-ink transition-colors focus:border-accent/60 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted";
  const patchConfig = (p: Partial<StudioElement["config"]>) => onPatchElement(element.id, { config: { ...config, ...p } });
  const transparent = config.backgroundColor === "transparent";

  return (
    <section className="border-b border-line p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{element.label}</p>
          <p className="truncate text-[11px] text-muted">{template ? template.name : element.templateKey} · {scene.name}</p>
        </div>
        {!isMedia && onToggleFx ? (
          <button
            type="button"
            onClick={onToggleFx}
            aria-pressed={fxOpen}
            className={`inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${fxOpen ? "border-accent bg-accent/15 text-accent" : "border-line text-ink hover:border-accent/50"}`}
            title="Styles et animations"
            aria-label="Styles et animations (fx)"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            fx
          </button>
        ) : null}
      </div>

      {!isMedia ? (
        <input
          id="pr-text"
          value={config.text}
          onChange={(e) => patchConfig({ text: e.target.value.slice(0, 120) })}
          className={inputCls + " mb-2.5"}
          placeholder="Votre texte"
          aria-label="Texte"
        />
      ) : null}

      <div role="tablist" className="mb-3 flex gap-1 rounded-xl bg-background p-1">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${activeTab === id ? "bg-line text-ink" : "text-muted hover:text-ink"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {activeTab === "style" && !isMedia ? (
          <>
            <div>
              <label htmlFor="pr-font" className={labelCls}>Police</label>
              <select
                id="pr-font"
                value={config.fontFamily ?? "system"}
                onChange={(e) => patchConfig({ fontFamily: e.target.value })}
                className={inputCls}
              >
                {BRAND_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>{font.label}</option>
                ))}
              </select>
            </div>

            {hasTypo ? (
              <SliderField id="pr-fontsize" label="Taille" unit="×" min={0.3} max={3} step={0.05} reset={1} value={config.fontSize ?? 1} onChange={(v) => patchConfig({ fontSize: Math.round(v * 100) / 100 })} />
            ) : null}

            <div>
              <p className={labelCls}>Alignement</p>
              <div className="grid grid-cols-4 gap-1">
                {ALIGN_OPTIONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => patchConfig({ align: id })}
                    aria-pressed={(config.align ?? "center") === id}
                    aria-label={label}
                    title={label}
                    className={`flex h-8 cursor-pointer items-center justify-center rounded-lg border text-ink ${(config.align ?? "center") === id ? "border-ink bg-line" : "border-line bg-background"}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={labelCls}>Couleurs</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["Texte", "primaryColor"],
                    ["Accent", "accentColor"],
                    ["Fond", "backgroundColor"],
                  ] as const
                ).map(([label, key]) => {
                  const off = key === "backgroundColor" && transparent;
                  return (
                    <label key={key} className="flex cursor-pointer flex-col gap-1">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted">{label}</span>
                      <span className={`relative flex h-9 items-center overflow-hidden rounded-lg border border-line ${off ? "opacity-40" : ""}`}>
                        <input
                          type="color"
                          disabled={off}
                          value={toValidHex(config[key])}
                          onChange={(e) => patchConfig({ [key]: e.target.value })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-90"
                          aria-label={`Couleur ${label}`}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patchConfig({ primaryColor: c })}
                    className="h-6 w-6 cursor-pointer rounded-full border border-line"
                    style={{ background: c }}
                    aria-label={`Couleur du texte ${c}`}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-background px-2.5 py-2">
              <span className="text-[11px] font-medium text-ink">Sans fond</span>
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => patchConfig({ backgroundColor: e.target.checked ? "transparent" : "#000000" })}
                className="h-4 w-4 cursor-pointer accent-[#0A84FF]"
                aria-label="Sans fond"
              />
            </label>

            <details className="group rounded-lg border border-line bg-background/50">
              <summary className="cursor-pointer select-none px-2.5 py-2 text-[11px] text-muted hover:text-ink">Codes hexadécimaux</summary>
              <div className="grid grid-cols-3 gap-2 p-2.5 pt-0">
                {(["primaryColor", "accentColor", "backgroundColor"] as const).map((key) => (
                  <input
                    key={`${key}-${config[key]}`}
                    defaultValue={config[key] === "transparent" ? "" : config[key]}
                    placeholder="#RRGGBB"
                    maxLength={9}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) patchConfig({ [key]: v });
                    }}
                    className={inputCls + " px-1.5 font-mono text-[10px]"}
                    aria-label={`Hex ${key}`}
                  />
                ))}
              </div>
            </details>
          </>
        ) : null}

        {activeTab === "spacing" && hasTypo ? (
          <>
            <SliderField id="pr-lineheight" label="Interligne" unit="×" min={0.6} max={2.5} step={0.05} reset={1} value={config.lineHeight ?? 1} onChange={(v) => patchConfig({ lineHeight: Math.round(v * 100) / 100 })} />
            <SliderField id="pr-letterspacing" label="Lettres" unit="em" min={-0.1} max={0.6} step={0.01} reset={0} value={config.letterSpacing ?? 0} onChange={(v) => patchConfig({ letterSpacing: Math.round(v * 100) / 100 })} />
            <SliderField id="pr-wordspacing" label="Mots" unit="em" min={-0.2} max={1.5} step={0.02} reset={0} value={config.wordSpacing ?? 0} onChange={(v) => patchConfig({ wordSpacing: Math.round(v * 100) / 100 })} />
          </>
        ) : null}

        {activeTab === "position" ? (
          <>
            <SliderField id="pr-x" label="Position X" unit="%" min={0} max={100} step={1} reset={50} value={element.x} onChange={(v) => onPatchElement(element.id, { x: v })} />
            <SliderField id="pr-y" label="Position Y" unit="%" min={0} max={100} step={1} reset={50} value={element.y} onChange={(v) => onPatchElement(element.id, { y: v })} />
            <SliderField id="pr-scale" label="Échelle" unit="×" min={0.2} max={3} step={0.05} reset={1} value={element.scale} onChange={(v) => onPatchElement(element.id, { scale: Math.round(v * 100) / 100 })} />
            <SliderField id="pr-rotation" label="Rotation" unit="°" min={-180} max={180} step={1} reset={0} value={element.rotation ?? 0} onChange={(v) => onPatchElement(element.id, { rotation: Math.round(v) })} />
            <div>
              <p className={labelCls}>Aligner sur la page</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["left", "Gauche", AlignStartVertical],
                    ["hcenter", "Centre horizontal", AlignCenterVertical],
                    ["right", "Droite", AlignEndVertical],
                    ["top", "Haut", AlignStartHorizontal],
                    ["vcenter", "Centre vertical", AlignCenterHorizontal],
                    ["bottom", "Bas", AlignEndHorizontal],
                  ] as [AlignEdge, string, typeof AlignCenter][]
                ).map(([edge, label, Icon]) => (
                  <button
                    key={edge}
                    type="button"
                    onClick={() => requestAlign(element.id, edge)}
                    className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent/50 hover:text-ink"
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            {onMoveLayer ? (
              <LayersList
                elements={scene.elements}
                selectedId={element.id}
                onSelect={onSelectElement}
                onMove={onMoveLayer}
                onToggleHidden={(id, hidden) => onPatchElement(id, { hidden: hidden ? true : undefined })}
                labelCls={labelCls}
              />
            ) : null}
          </>
        ) : null}

        {activeTab === "animation" ? (
          <div className="grid grid-cols-2 gap-2.5">
            {isMedia && element.media ? (
              <MediaOptionsFields media={element.media} onChange={(media) => onPatchElement(element.id, { media })} labelCls={labelCls} inputCls={inputCls} />
            ) : null}
            <div>
              <label htmlFor="pr-duration" className={labelCls}>Durée (s)</label>
              <input
                id="pr-duration"
                type="number"
                min={0.5}
                max={120}
                step={0.5}
                value={element.duration}
                onChange={(e) => onPatchElement(element.id, { duration: Math.max(0.5, Math.min(120, Number(e.target.value) || 0.5)) })}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className={inputCls}
              />
            </div>
            {!isMedia ? (
              <div>
                <label htmlFor="pr-speed" className={labelCls}>Vitesse</label>
                <input
                  id="pr-speed"
                  type="number"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={config.speed}
                  onChange={(e) => patchConfig({ speed: Number(e.target.value) || 1 })}
                  className={inputCls}
                />
              </div>
            ) : null}
            <div className="col-span-2">
              <label htmlFor="pr-timing" className={labelCls}>Adaptation à la durée</label>
              <select
                id="pr-timing"
                value={element.timing ?? "natural"}
                onChange={(e) => onPatchElement(element.id, { timing: e.target.value as ElementTiming })}
                className={inputCls}
              >
                <option value="fit">Ajustée : entrée, maintien, sortie à la fin</option>
                <option value="hold">Figée à la fin (sans sortie)</option>
                <option value="natural">Naturelle (vitesse d’origine)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-label" className={labelCls}>Nom du calque</label>
              <input
                id="pr-label"
                value={element.label}
                onChange={(e) => onPatchElement(element.id, { label: e.target.value.slice(0, 60) })}
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={() => onDeleteElement(element.id)}
              className="col-span-2 inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line text-xs text-muted transition-colors hover:border-red-500/50 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Supprimer le calque
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LayersList({ elements, selectedId, onSelect, onMove, onToggleHidden, labelCls }: {
  elements: StudioElement[];
  selectedId: string;
  onSelect?: (id: string) => void;
  onMove: (id: string, target: number) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  labelCls: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Premier plan en haut : on affiche la liste inversée.
  const rows = elements.map((el, index) => ({ el, index })).reverse();
  const end = () => { setDragId(null); setOverIndex(null); };

  return (
    <div>
      <p className={labelCls}>
        Calques · glisser pour réordonner (haut = premier plan)
      </p>
      <ul className="flex flex-col gap-1" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverIndex(null); }}>
        {rows.map(({ el, index }) => {
          const active = el.id === selectedId;
          const showLine = dragId !== null && overIndex === index && dragId !== el.id;
          return (
            <li
              key={el.id}
              draggable
              onDragStart={(e) => { setDragId(el.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", el.id); }}
              onDragOver={(e) => { if (dragId === null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIndex(index); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== el.id) onMove(dragId, index); end(); }}
              onDragEnd={end}
              onClick={() => onSelect?.(el.id)}
              className={`flex cursor-grab items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-xs active:cursor-grabbing ${active ? "border-accent/70 bg-accent/10" : "border-line bg-background"} ${dragId === el.id ? "opacity-40" : ""} ${showLine ? "shadow-[0_-2px_0_0_#0A84FF]" : ""} ${el.hidden ? "text-muted" : "text-ink"}`}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{el.kind === "media" ? el.label : el.config.text || el.label}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleHidden(el.id, !el.hidden); }}
                className="shrink-0 cursor-pointer rounded-md p-1 text-muted hover:text-ink"
                aria-label={el.hidden ? "Afficher le calque" : "Masquer le calque"}
              >
                {el.hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MEDIA_LABELS = {
  fit: { cover: "Remplir le cadre", contain: "Image entière" },
  frame: { none: "Aucun", browser: "Fenêtre de navigateur", phone: "Téléphone" },
  motion: { none: "Aucun", "zoom-in": "Zoom avant lent", "zoom-out": "Zoom arrière lent", "pan-left": "Panoramique gauche", "pan-right": "Panoramique droite" },
  enter: { none: "Aucune", fade: "Fondu", rise: "Montée", scale: "Agrandissement" },
} as const;

function MediaOptionsFields({
  media,
  onChange,
  labelCls,
  inputCls,
}: {
  media: MediaOptions;
  onChange: (media: MediaOptions) => void;
  labelCls: string;
  inputCls: string;
}) {
  return (
    <>
      {(Object.keys(MEDIA_LABELS) as (keyof typeof MEDIA_LABELS)[]).map((key) => (
        <div key={key} className="col-span-2">
          <label htmlFor={`pr-media-${key}`} className={labelCls}>
            {{ fit: "Cadrage", frame: "Habillage", motion: "Mouvement", enter: "Entrée / sortie" }[key]}
          </label>
          <select
            id={`pr-media-${key}`}
            value={media[key]}
            onChange={(e) => onChange({ ...media, [key]: e.target.value } as MediaOptions)}
            className={inputCls}
          >
            {Object.entries(MEDIA_LABELS[key]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      ))}
      <div className="col-span-2">
        <label htmlFor="pr-media-trim" className={labelCls}>Vidéo : démarrer à (s)</label>
        <input
          id="pr-media-trim"
          type="number"
          min={0}
          step={0.5}
          value={media.trimStart}
          onChange={(e) => onChange({ ...media, trimStart: Math.max(0, Number(e.target.value) || 0) })}
          className={inputCls}
        />
      </div>
    </>
  );
}

function SliderField({ id, label, unit, min, max, step, reset, value, onChange }: {
  id: string; label: string; unit: string; min: number; max: number; step: number; reset: number; value: number; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : reset));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-[9px] font-medium uppercase tracking-wider text-muted">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-16 rounded-md border border-line bg-background px-1.5 py-0.5 text-right font-mono text-[11px] text-ink"
            aria-label={`${label} (valeur)`}
          />
          <span className="w-3 text-[10px] text-muted">{unit}</span>
          <button
            type="button"
            onClick={() => onChange(reset)}
            disabled={value === reset}
            className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted disabled:opacity-30"
            aria-label={`Réinitialiser ${label}`}
            title="Réinitialiser"
          >
            ↺
          </button>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-2 w-full cursor-pointer accent-[#A1A1AA]"
        aria-label={label}
      />
    </div>
  );
}

const QUICK_COLORS = ["#FFFFFF", "#F5F5F7", "#A1A1AA", "#52525B", "#18181B", "#000000", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
const ALIGN_OPTIONS = [
  { id: "left", label: "Aligner à gauche", Icon: AlignLeft },
  { id: "center", label: "Centrer", Icon: AlignCenter },
  { id: "right", label: "Aligner à droite", Icon: AlignRight },
  { id: "justify", label: "Justifier", Icon: AlignJustify },
] as const;

function toValidHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
}

/* ------------------------------------------------------------------ */
/* Styles compatibles — remplacement instantané                         */
/* ------------------------------------------------------------------ */

export function CompatibleStyles({
  element,
  project,
  onChange,
  layout = "list",
  onClose,
}: {
  element: StudioElement;
  project: StudioProject;
  onChange: (elementId: string, newTemplateKey: string) => void;
  /** list = colonne (mobile) ; strip = bandeau horizontal sur la scène. */
  layout?: "list" | "strip";
  onClose?: () => void;
}) {
  const strip = layout === "strip";
  const compatible = templatesForKind(element.kind).filter((t) => t.elementKind === element.kind);

  return (
    <section className={strip ? "shrink-0 border-t border-line bg-surface/95 p-3" : "p-4"}>
      <div className={`${strip ? "mb-2" : "mb-3"} flex items-center justify-between gap-2`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Styles · {compatible.length} · le texte, les couleurs et la position sont conservés (Cmd+Z pour annuler)
        </p>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Fermer les styles" className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={strip ? "flex gap-2.5 overflow-x-auto pb-1" : "flex flex-col gap-2.5"}>
        {compatible.map((template) => {
          const isCurrent = template.key === element.templateKey;
          const previewConfig = {
            ...element.config,
            duration: Math.min(element.duration, element.config.duration + 1.5),
          };
          if (project.scenes[0] === undefined) return null;
          return (
            <button
              key={template.key}
              type="button"
              disabled={isCurrent}
              onClick={() => onChange(element.id, template.key)}
              className={`group cursor-pointer overflow-hidden rounded-xl border text-left transition-all disabled:cursor-default ${strip ? "w-48 shrink-0" : ""} ${
                isCurrent
                  ? "border-accent/70 bg-accent/5"
                  : "border-line bg-background/60 hover:border-accent/50 hover:-translate-y-0.5"
              }`}
            >
              <div
                className="pointer-events-none relative w-full"
                style={{ aspectRatio: "16 / 7" }}
              >
                <div className="absolute -inset-1 origin-center scale-95 transition-transform duration-300 group-hover:scale-100">
                  <LoopingDemoFrame
                    templateKey={template.key as ComponentKey}
                    config={previewConfig}
                  />
                </div>
                {isCurrent ? (
                  <span className="absolute right-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                ) : null}
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/70 to-transparent"
                  aria-hidden="true"
                />
                <span className="absolute bottom-1.5 left-2.5 z-10 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                  {template.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className={strip ? "hidden" : "mt-3 text-[10px] text-muted/70"}>
        {compatible.length === 1
          ? "Un seul style pour ce type d'élément — d'autres arrivent en Phase 2."
          : `${compatible.length} styles pour les éléments de type « ${element.kind} ».`}
      </p>
    </section>
  );
}