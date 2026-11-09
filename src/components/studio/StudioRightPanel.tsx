"use client";

import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Check, ChevronDown, ChevronUp, Layers, MousePointerClick as MousePointerClickIcon, Palette, Timer, Trash2, Type } from "lucide-react";
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
  variant = "sidebar",
}: {
  project: StudioProject;
  selection: StudioSelection | null;
  /** sidebar = colonne de droite (≥ 1024 px) ; sheet = panneau glissant mobile. */
  variant?: "sidebar" | "sheet";
  time?: number;
  onChangeTemplate: (elementId: string, newTemplateKey: string) => void;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveLayer?: (elementId: string, target: "up" | "down" | "front" | "back") => void;
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
          <ElementProperties selection={selection} onPatchElement={onPatchElement} onDeleteElement={onDeleteElement} onMoveLayer={onMoveLayer} />
          {selection.element.kind === "media" ? null : (
            <CompatibleStyles
              element={selection.element}
              project={project}
              onChange={onChangeTemplate}
            />
          )}
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Propriétés de l'élément sélectionné                                  */
/* ------------------------------------------------------------------ */

function ElementProperties({
  selection,
  onPatchElement,
  onDeleteElement,
  onMoveLayer,
}: {
  selection: StudioSelection;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveLayer?: (elementId: string, target: "up" | "down" | "front" | "back") => void;
}) {
  const { element, scene } = selection;
  const template = getStudioTemplate(element.templateKey);
  const config = element.config;

  const inputCls =
    "h-9 w-full rounded-lg border border-line bg-background px-2.5 text-xs text-ink transition-colors focus:border-accent/60 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted";

  return (
    <section className="border-b border-line p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{element.label}</p>
          <p className="font-mono text-[10px] text-muted">{element.templateKey}</p>
        </div>
        <button
          type="button"
          onClick={() => onDeleteElement(element.id)}
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-red-500/50 hover:text-red-300"
          aria-label={`Supprimer l'élément ${element.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        {template ? `${template.name} — ${scene.name}` : element.templateKey}
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {element.kind === "media" && element.media ? (
          <MediaOptionsFields media={element.media} onChange={(media) => onPatchElement(element.id, { media })} labelCls={labelCls} inputCls={inputCls} />
        ) : null}

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <label htmlFor="pr-text" className={labelCls}>
            <Type className="mr-1 inline-block h-3 w-3" aria-hidden="true" /> Texte
          </label>
          <input
            id="pr-text"
            value={config.text}
            onChange={(e) => onPatchElement(element.id, { config: { ...config, text: e.target.value.slice(0, 120) } })}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="pr-duration" className={labelCls}>Durée (s)</label>
          <input
            id="pr-duration"
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            value={element.duration}
            onChange={(e) =>
              onPatchElement(element.id, {
                duration: Math.max(0.5, Math.min(120, Number(e.target.value) || 0.5)),
              })
            }
            onWheel={(e) => {
              // Évite le défilement accidentel de la page sur les inputs.
              (e.target as HTMLInputElement).blur();
            }}
            className={inputCls}
          />
        </div>

        <div className={element.kind === "media" ? "hidden" : undefined}>
          <label htmlFor="pr-speed" className={labelCls}>Vitesse</label>
          <input
            id="pr-speed"
            type="number"
            min={0.25}
            max={3}
            step={0.05}
            value={config.speed}
            onChange={(e) => onPatchElement(element.id, { config: { ...config, speed: Number(e.target.value) || 1 } })}
            className={inputCls}
          />
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <SliderField id="pr-x" label="Position X" unit="%" min={0} max={100} step={1} reset={50} value={element.x} onChange={(v) => onPatchElement(element.id, { x: v })} />
          <SliderField id="pr-y" label="Position Y" unit="%" min={0} max={100} step={1} reset={50} value={element.y} onChange={(v) => onPatchElement(element.id, { y: v })} />
          <SliderField id="pr-scale" label="Échelle" unit="×" min={0.2} max={3} step={0.05} reset={1} value={element.scale} onChange={(v) => onPatchElement(element.id, { scale: Math.round(v * 100) / 100 })} />
          <SliderField id="pr-rotation" label="Rotation" unit="°" min={-180} max={180} step={1} reset={0} value={element.rotation ?? 0} onChange={(v) => onPatchElement(element.id, { rotation: Math.round(v) })} />
        </div>

        <div>
          <label htmlFor="pr-label" className={labelCls}>Libellé</label>
          <input
            id="pr-label"
            value={element.label}
            onChange={(e) => onPatchElement(element.id, { label: e.target.value.slice(0, 60) })}
            className={inputCls}
          />
        </div>

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <p className={labelCls}>
            <Palette className="mr-1 inline-block h-3 w-3" aria-hidden="true" /> Couleurs
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Principale", "primaryColor"],
                ["Accent", "accentColor"],
                ["Fond", "backgroundColor"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="flex cursor-pointer flex-col gap-1">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted">{label}</span>
                <span className="relative flex h-9 items-center overflow-hidden rounded-lg border border-line">
                  <input
                    type="color"
                    disabled={key === "backgroundColor" && config.backgroundColor === "transparent"}
                    value={toValidHex(config[key])}
                    onChange={(e) => onPatchElement(element.id, { config: { ...config, [key]: e.target.value } })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-90"
                    aria-label={`Couleur ${key}`}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-background px-2.5 py-2">
            <span className="text-[11px] font-medium text-ink">Sans fond (supprimer le fond du calque)</span>
            <input
              type="checkbox"
              checked={config.backgroundColor === "transparent"}
              onChange={(e) =>
                onPatchElement(element.id, {
                  config: { ...config, backgroundColor: e.target.checked ? "transparent" : "#000000" },
                })
              }
              className="h-4 w-4 cursor-pointer accent-[#0A84FF]"
              aria-label="Sans fond"
            />
          </label>
        </div>

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <p className={labelCls}>Couleurs rapides (texte principal)</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPatchElement(element.id, { config: { ...config, primaryColor: c } })}
                className="h-6 w-6 rounded-full border border-line"
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                title={c}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["primaryColor", "accentColor", "backgroundColor"] as const).map((key) => (
              <input
                key={`${key}-${config[key]}`}
                defaultValue={config[key] === "transparent" ? "" : config[key]}
                placeholder="#RRGGBB"
                maxLength={9}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) onPatchElement(element.id, { config: { ...config, [key]: v } });
                }}
                className={inputCls + " font-mono text-[10px]"}
                aria-label={`Hex ${key}`}
              />
            ))}
          </div>
        </div>

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <p className={labelCls}>Alignement du texte</p>
          <div className="grid grid-cols-4 gap-1">
            {ALIGN_OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onPatchElement(element.id, { config: { ...config, align: id } })}
                aria-pressed={(config.align ?? "center") === id}
                aria-label={label}
                title={label}
                className={`flex h-8 items-center justify-center rounded-lg border text-ink ${(config.align ?? "center") === id ? "border-ink bg-line" : "border-line bg-background"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label htmlFor="pr-timing" className={labelCls}>
            <Timer className="mr-1 inline-block h-3 w-3" aria-hidden="true" /> Adaptation à la durée
          </label>
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

        <div className={element.kind === "media" ? "hidden" : "col-span-2"}>
          <label htmlFor="pr-font" className={labelCls}>Police</label>
          <select
            id="pr-font"
            value={config.fontFamily ?? "system"}
            onChange={(e) => onPatchElement(element.id, { config: { ...config, fontFamily: e.target.value } })}
            className={inputCls}
          >
            {BRAND_FONTS.map((font) => (
              <option key={font.id} value={font.id}>{font.label}</option>
            ))}
          </select>
        </div>

        <div className={supportsFontSize(element.templateKey, element.kind) ? "col-span-2 flex flex-col gap-3" : "hidden"}>
          <p className={labelCls}>
            <Type className="mr-1 inline-block h-3 w-3" aria-hidden="true" /> Typographie
          </p>
          <SliderField id="pr-fontsize" label="Taille du texte" unit="×" min={0.3} max={3} step={0.05} reset={1} value={config.fontSize ?? 1} onChange={(v) => onPatchElement(element.id, { config: { ...config, fontSize: Math.round(v * 100) / 100 } })} />
          <SliderField id="pr-lineheight" label="Interligne (vertical)" unit="×" min={0.6} max={2.5} step={0.05} reset={1} value={config.lineHeight ?? 1} onChange={(v) => onPatchElement(element.id, { config: { ...config, lineHeight: Math.round(v * 100) / 100 } })} />
          <SliderField id="pr-letterspacing" label="Espace des lettres" unit="em" min={-0.1} max={0.6} step={0.01} reset={0} value={config.letterSpacing ?? 0} onChange={(v) => onPatchElement(element.id, { config: { ...config, letterSpacing: Math.round(v * 100) / 100 } })} />
          <SliderField id="pr-wordspacing" label="Espace des mots (horizontal)" unit="em" min={-0.2} max={1.5} step={0.02} reset={0} value={config.wordSpacing ?? 0} onChange={(v) => onPatchElement(element.id, { config: { ...config, wordSpacing: Math.round(v * 100) / 100 } })} />
        </div>

        {onMoveLayer ? (
          <div className="col-span-2">
            <p className={labelCls}>
              <Layers className="mr-1 inline-block h-3 w-3" aria-hidden="true" /> Calque {scene.elements.findIndex((el) => el.id === element.id) + 1}/{scene.elements.length}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["back", "Tout au fond", ArrowDownToLine],
                  ["down", "Descendre", ChevronDown],
                  ["up", "Monter", ChevronUp],
                  ["front", "Premier plan", ArrowUpToLine],
                ] as const
              ).map(([target, label, Icon]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => onMoveLayer(element.id, target)}
                  className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent/50 hover:text-ink"
                  aria-label={label}
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
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

function CompatibleStyles({
  element,
  project,
  onChange,
}: {
  element: StudioElement;
  project: StudioProject;
  onChange: (elementId: string, newTemplateKey: string) => void;
}) {
  const compatible = templatesForKind(element.kind).filter((t) => t.elementKind === element.kind);

  return (
    <section className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Styles compatibles · {element.kind}
        </p>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
          {compatible.length}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        Cliquez pour remplacer instantanément : le texte, les couleurs, la
        durée et la position sont conservés. Annulable (Cmd+Z).
      </p>

      <div className="flex flex-col gap-2.5">
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
              className={`group cursor-pointer overflow-hidden rounded-xl border text-left transition-all disabled:cursor-default ${
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
      <p className="mt-3 text-[10px] text-muted/70">
        {compatible.length === 1
          ? "Un seul style pour ce type d'élément — d'autres arrivent en Phase 2."
          : `${compatible.length} styles pour les éléments de type « ${element.kind} ».`}
      </p>
    </section>
  );
}