"use client";

import { Check, MousePointerClick as MousePointerClickIcon, Palette, Trash2, Type } from "lucide-react";
import type { StudioElement, StudioProject, StudioScene } from "@/lib/studio/project-model";
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
}: {
  project: StudioProject;
  selection: StudioSelection | null;
  time?: number;
  onChangeTemplate: (elementId: string, newTemplateKey: string) => void;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
}) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface/40 lg:flex xl:w-80">
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
          <ElementProperties selection={selection} onPatchElement={onPatchElement} onDeleteElement={onDeleteElement} />
          <CompatibleStyles
            element={selection.element}
            project={project}
            onChange={onChangeTemplate}
          />
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
}: {
  selection: StudioSelection;
  onPatchElement: (elementId: string, patch: Partial<StudioElement>) => void;
  onDeleteElement: (elementId: string) => void;
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
        <div className="col-span-2">
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

        <div>
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

        <div>
          <label htmlFor="pr-x" className={labelCls}>Position X (%)</label>
          <input
            id="pr-x"
            type="number"
            min={0}
            max={100}
            value={element.x}
            onChange={(e) => onPatchElement(element.id, { x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="pr-y" className={labelCls}>Position Y (%)</label>
          <input
            id="pr-y"
            type="number"
            min={0}
            max={100}
            value={element.y}
            onChange={(e) => onPatchElement(element.id, { y: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="pr-scale" className={labelCls}>Échelle</label>
          <input
            id="pr-scale"
            type="number"
            min={0.2}
            max={3}
            step={0.05}
            value={element.scale}
            onChange={(e) => onPatchElement(element.id, { scale: Math.max(0.2, Math.min(3, Number(e.target.value) || 1)) })}
            className={inputCls}
          />
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

        <div className="col-span-2">
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
      </div>
    </section>
  );
}

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