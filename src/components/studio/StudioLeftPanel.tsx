"use client";

import { useState } from "react";
import { Copy, Film, Image as ImageIcon, Layers3, Palette, Plus, Trash2, Upload, Wand2, X } from "lucide-react";
import MediaPanel from "./MediaPanel";
import TemplateLibrary from "./TemplateLibrary";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import { LOGO_MAX_CHARS } from "@/lib/animations/config";
import type { BrandKit, MediaAsset, ProjectAudio, SceneTransition, StudioProject } from "@/lib/studio/project-model";
import { SCENE_TRANSITIONS } from "@/lib/studio/project-model";

const TRANSITION_LABELS: Record<string, string> = {
  none: "Coupe franche",
  fade: "Fondu",
  "slide-left": "Glissement ←",
  "slide-up": "Glissement ↑",
  wipe: "Volet",
  zoom: "Zoom",
};

export type LeftPanelTab = "scenes" | "library" | "media" | "brand";

/**
 * Panneau gauche du Studio : scènes + bibliothèque de templates + médias
 * (l'import de médias arrive en Phase 3 — indication honnête).
 */
export default function StudioLeftPanel({
  project,
  currentSceneIndex,
  onJumpToScene,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onUpdateSceneDuration,
  onAddElement,
  onUpdateSceneBackground,
  onUpdateBrand,
  onApplyBrand,
  mediaUrls = {},
  onAddAsset,
  onAddMediaToScene,
  onSetAudio,
  onUpdateSceneTransition,
  onDuplicateScene,
  variant = "sidebar",
  forcedTab,
}: {
  project: StudioProject;
  currentSceneIndex: number;
  onJumpToScene: (index: number) => void;
  onAddScene: () => void;
  onDeleteScene: (index: number) => void;
  onRenameScene: (index: number, name: string) => void;
  onUpdateSceneDuration: (index: number, duration: number) => void;
  onAddElement: (templateKey: string) => void;
  onUpdateSceneBackground?: (index: number, background: string) => void;
  onUpdateBrand?: (brand: BrandKit) => void;
  onApplyBrand?: (brand: BrandKit) => void;
  mediaUrls?: Record<string, string>;
  onAddAsset?: (asset: MediaAsset) => void;
  onAddMediaToScene?: (asset: MediaAsset) => void;
  onSetAudio?: (audio: ProjectAudio | null) => void;
  onUpdateSceneTransition?: (index: number, transition: SceneTransition | null) => void;
  onDuplicateScene?: (index: number) => void;
  /** sidebar = colonne de gauche ; sheet = panneau glissant mobile (onglet imposé, sans barre d'onglets). */
  variant?: "sidebar" | "sheet";
  forcedTab?: LeftPanelTab;
}) {
  const [ownTab, setTab] = useState<LeftPanelTab>("scenes");
  const tab = forcedTab ?? ownTab;

  const tabs = [
    { id: "scenes" as const, label: "Scènes", icon: Layers3 },
    { id: "library" as const, label: "Templates", icon: Film },
    { id: "media" as const, label: "Médias", icon: ImageIcon },
    { id: "brand" as const, label: "Marque", icon: Palette },
  ];

  return (
    <aside className={variant === "sheet" ? "flex w-full flex-col" : "flex w-64 shrink-0 flex-col border-r border-line bg-surface/40 lg:w-72"}>
      <div className={variant === "sheet" ? "hidden" : "flex border-b border-line p-2"}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors ${
              tab === tb.id ? "bg-elevated text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <tb.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tb.label}
          </button>
        ))}
      </div>

      <div className={variant === "sheet" ? "p-3" : "flex-1 overflow-y-auto p-3"}>
        {tab === "scenes" ? (
          <div className="flex flex-col gap-2">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {project.scenes.length} scène{project.scenes.length > 1 ? "s" : ""}
            </p>
            {project.scenes.map((scene, i) => (
              <div
                key={scene.id}
                className={`group rounded-xl border p-2.5 transition-colors ${
                  i === currentSceneIndex ? "border-accent/60 bg-accent/5" : "border-line bg-background/60 hover:border-muted/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onJumpToScene(i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-sm font-medium text-ink">{scene.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{scene.duration.toFixed(1)}s</span>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={scene.name}
                    onChange={(e) => onRenameScene(i, e.target.value)}
                    className="h-7 min-w-0 flex-1 rounded-md border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                    aria-label={`Nom de la scène ${i + 1}`}
                  />
                  <input
                    type="number"
                    min={1}
                    max={600}
                    step={0.5}
                    value={scene.duration}
                    onChange={(e) => onUpdateSceneDuration(i, Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                    className="h-7 w-16 rounded-md border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                    aria-label={`Durée de la scène ${i + 1}`}
                  />
                  {onUpdateSceneBackground ? (
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(scene.background ?? "") ? (scene.background as string) : "#000000"}
                      onChange={(e) => onUpdateSceneBackground(i, e.target.value)}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-line bg-background"
                      aria-label={`Fond de la scène ${scene.name}`}
                      title="Fond de la scène (sous les calques)"
                    />
                  ) : null}
                  {onDuplicateScene ? (
                    <button
                      type="button"
                      onClick={() => onDuplicateScene(i)}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-accent/50 hover:text-ink"
                      aria-label={`Dupliquer la scène ${scene.name}`}
                      title="Dupliquer la scène"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDeleteScene(i)}
                    disabled={project.scenes.length <= 1}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
                    aria-label={`Supprimer la scène ${scene.name}`}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                {i > 0 && onUpdateSceneTransition ? (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={scene.transition?.type ?? "none"}
                      onChange={(e) =>
                        onUpdateSceneTransition(
                          i,
                          e.target.value === "none"
                            ? null
                            : { type: e.target.value as SceneTransition["type"], duration: scene.transition?.duration ?? 0.6 }
                        )
                      }
                      className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-background px-1.5 text-[11px] text-ink focus:border-accent/60 focus:outline-none"
                      aria-label={`Transition d'entrée de la scène ${scene.name}`}
                    >
                      {SCENE_TRANSITIONS.map((t) => (
                        <option key={t} value={t}>
                          {TRANSITION_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    {scene.transition ? (
                      <input
                        type="number"
                        min={0.2}
                        max={2}
                        step={0.1}
                        value={scene.transition.duration}
                        onChange={(e) =>
                          onUpdateSceneTransition(i, { type: scene.transition!.type, duration: Math.max(0.2, Math.min(2, Number(e.target.value) || 0.6)) })
                        }
                        className="h-7 w-16 rounded-md border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                        aria-label={`Durée de la transition de la scène ${scene.name}`}
                        title="Durée de la transition (s)"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={onAddScene}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une scène
            </button>
          </div>
        ) : tab === "library" ? (
          <TemplateLibrary project={project} onAddElement={onAddElement} />
        ) : tab === "media" ? (
          <MediaPanel
            project={project}
            urls={mediaUrls}
            onAddAsset={(a) => onAddAsset?.(a)}
            onAddToScene={(a) => onAddMediaToScene?.(a)}
            onSetAudio={(a) => onSetAudio?.(a)}
          />
        ) : (
          <BrandPanel project={project} onUpdateBrand={onUpdateBrand} onApplyBrand={onApplyBrand} />
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Kit de marque : nom, couleurs, police, logo                         */
/* ------------------------------------------------------------------ */

const DEFAULT_BRAND: BrandKit = {
  primaryColor: "#F5F5F7",
  accentColor: "#0A84FF",
  backgroundColor: "#000000",
  fontFamily: "system",
};

function BrandPanel({
  project,
  onUpdateBrand,
  onApplyBrand,
}: {
  project: StudioProject;
  onUpdateBrand?: (brand: BrandKit) => void;
  onApplyBrand?: (brand: BrandKit) => void;
}) {
  const brand = project.brand ?? DEFAULT_BRAND;
  const [logoError, setLogoError] = useState<string | null>(null);
  const update = (patch: Partial<BrandKit>) => onUpdateBrand?.({ ...brand, ...patch });
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted";
  const inputCls =
    "h-9 w-full rounded-lg border border-line bg-background px-2.5 text-xs text-ink focus:border-accent/60 focus:outline-none";

  const onLogoFile = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setLogoError("Format accepté : PNG, JPEG, WebP ou SVG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (url.length > LOGO_MAX_CHARS) {
        setLogoError("Logo trop lourd (300 Ko maximum).");
        return;
      }
      update({ logoUrl: url });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Définissez l’identité du projet, puis appliquez-la à toutes les scènes et à tous les éléments.
      </p>
      <div>
        <label htmlFor="brand-name" className={labelCls}>Nom de la marque</label>
        <input
          id="brand-name"
          value={brand.name ?? ""}
          onChange={(e) => update({ name: e.target.value.slice(0, 60) })}
          className={inputCls}
          placeholder="Ex. NOVA"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Texte", "primaryColor"],
            ["Accent", "accentColor"],
            ["Fond", "backgroundColor"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className="flex cursor-pointer flex-col gap-1">
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted">{label}</span>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(brand[key]) ? brand[key] : "#000000"}
              onChange={(e) => update({ [key]: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-line bg-background"
              aria-label={`Couleur de marque : ${label}`}
            />
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="brand-font" className={labelCls}>Police</label>
        <select id="brand-font" value={brand.fontFamily ?? "system"} onChange={(e) => update({ fontFamily: e.target.value })} className={inputCls}>
          {BRAND_FONTS.map((font) => (
            <option key={font.id} value={font.id}>{font.label}</option>
          ))}
        </select>
      </div>
      <div>
        <p className={labelCls}>Logo</p>
        {brand.logoUrl ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-background p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="Logo de la marque" className="h-10 w-10 rounded object-contain" />
            <span className="flex-1 text-[11px] text-muted">Utilisé par les Logo Reveal</span>
            <button
              type="button"
              onClick={() => update({ logoUrl: undefined })}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-muted hover:text-ink"
              aria-label="Retirer le logo"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <label className="mt-1.5 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line text-xs text-muted transition-colors hover:border-accent/50 hover:text-ink">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          {brand.logoUrl ? "Remplacer le logo" : "Importer un logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              onLogoFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {logoError ? <p className="mt-1 text-[11px] text-red-300">{logoError}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onApplyBrand?.(brand)}
        className="mt-1 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
      >
        <Wand2 className="h-4 w-4" aria-hidden="true" /> Appliquer à tout le projet
      </button>
    </div>
  );
}
