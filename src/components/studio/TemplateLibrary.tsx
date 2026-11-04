"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { GripVertical, Search, X } from "lucide-react";
import type { StudioProject } from "@/lib/studio/project-model";
import { brandedConfig, FRAME_SECONDS } from "@/lib/studio/project-model";
import { STUDIO_CATEGORIES, STUDIO_TEMPLATES, type StudioTemplateMeta } from "@/lib/studio/template-registry";
import type { ComponentKey } from "@/types/animation";
import ControlledAnimation from "./ControlledAnimation";

/** Type MIME du glisser-déposer d'un template (bibliothèque → timeline / aperçu). */
export const TEMPLATE_DRAG_TYPE = "application/x-mgsi-template";

/**
 * Bibliothèque de templates en vignettes : image représentative au repos,
 * animation en boucle au survol (ou au focus clavier). Clic = ajout à la suite
 * dans la scène ; glisser = placement précis sur la timeline ou l'aperçu.
 */
export default function TemplateLibrary({
  project,
  onAddElement,
}: {
  project: StudioProject;
  onAddElement: (templateKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const allTemplates = Object.entries(STUDIO_TEMPLATES);
  const matches = allTemplates.filter(([key, template]) =>
    (category === "all" || template.studioCategory === category) &&
    (!normalizedQuery || (template.name + " " + key + " " + template.studioCategory).toLocaleLowerCase("fr").includes(normalizedQuery))
  );
  const previewTemplate = previewKey ? STUDIO_TEMPLATES[previewKey] : undefined;

  useEffect(() => {
    if (!previewTemplate) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewKey(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [previewTemplate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une animation"
          aria-label="Rechercher une animation"
          className="w-full rounded-xl border border-line bg-background/60 py-2 pl-9 pr-3 text-xs text-ink outline-none focus:border-accent"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrer par catégorie">
        {[{ id: "all", label: "Tous" }, ...STUDIO_CATEGORIES].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${category === item.id ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:text-ink"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="px-1 text-[11px] text-muted" role="status">
        {matches.length} animation{matches.length > 1 ? "s" : ""} · Prévisualisez avant d’ajouter à la scène.
      </p>
      {matches.length === 0 ? (
        <div className="rounded-xl border border-line px-3 py-6 text-center text-xs text-muted">
          Aucune animation trouvée. Essayez une autre recherche ou catégorie.
        </div>
      ) : STUDIO_CATEGORIES.map((item) => {
        const templates = matches.filter(([, t]) => t.studioCategory === item.id);
        if (templates.length === 0) return null;
        return (
          <section key={item.id} aria-label={item.label}>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{item.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(([key, template]) => (
                <TemplateCard
                  key={key}
                  templateKey={key}
                  template={template}
                  project={project}
                  onAdd={() => onAddElement(key)}
                  onPreview={() => setPreviewKey(key)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {previewTemplate && previewKey ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewKey(null); }}
        >
          <div role="dialog" aria-modal="true" aria-label={`Prévisualisation : ${previewTemplate.name}`} className="w-full max-w-xl rounded-2xl border border-line bg-background p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{previewTemplate.name}</h3>
              <button type="button" onClick={() => setPreviewKey(null)} aria-label="Fermer la prévisualisation" className="rounded-lg p-2 text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-hidden rounded-xl">
              <TemplateThumb templateKey={previewKey} template={previewTemplate} project={project} playing />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted">Durée : {previewTemplate.timelineDuration} s</span>
              <button type="button" onClick={() => { onAddElement(previewKey); setPreviewKey(null); }} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">Ajouter à la scène</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TemplateCard({
  templateKey,
  template,
  project,
  onAdd,
  onPreview,
}: {
  templateKey: string;
  template: StudioTemplateMeta;
  project: StudioProject;
  onAdd: () => void;
  onPreview: () => void;
}) {
  const [active, setActive] = useState(false);
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(TEMPLATE_DRAG_TYPE, templateKey);
    e.dataTransfer.setData("text/plain", template.name);
    e.dataTransfer.effectAllowed = "copy";
    setActive(false);
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-background/60 transition-colors hover:border-accent/60"
      data-template-card={templateKey}
    >
      <TemplateThumb templateKey={templateKey} template={template} project={project} playing={active} />
      <span className="flex items-center gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">{template.name}</span>
        <span className="shrink-0 font-mono text-[9px] text-muted">{template.timelineDuration}s</span>
        <GripVertical className="h-3 w-3 shrink-0 text-muted/50" aria-hidden="true" />
      </span>
      <div className="flex gap-1 px-2 pb-2">
        <button type="button" onClick={onPreview} className="min-w-0 flex-1 rounded-md border border-line px-1 py-1.5 text-[10px] text-ink focus-visible:outline focus-visible:outline-accent">Aperçu</button>
        <button type="button" onClick={onAdd} className="min-w-0 flex-1 rounded-md bg-accent px-1 py-1.5 text-[10px] font-semibold text-white focus-visible:outline focus-visible:outline-accent" aria-label={`Ajouter ${template.name} à la scène`}>Ajouter</button>
      </div>
    </div>
  );
}

/**
 * Vignette : le moteur du Studio (ControlledAnimation) à un instant fixe,
 * ou piloté en boucle par requestAnimationFrame pendant le survol.
 */
function TemplateThumb({
  templateKey,
  template,
  project,
  playing,
}: {
  templateKey: string;
  template: StudioTemplateMeta;
  project: StudioProject;
  playing: boolean;
}) {
  const D = template.timelineDuration;
  const restTime = Math.round(D * 0.55 * 30) / 30;
  const [time, setTime] = useState(restTime);
  const raf = useRef<number | null>(null);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "160px",
      threshold: 0,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || !visible || reducedMotion) {
      // Retour à l'image de repos quand le survol se termine (après la fin de la boucle rAF).
      const id = requestAnimationFrame(() => setTime(restTime));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    const loop = (now: number) => {
      // Boucle : l'animation complète, puis une courte pause sur la dernière image.
      const t = ((now - t0) / 1000) % (D + 0.6);
      setTime(Math.min(t, D - FRAME_SECONDS));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, visible, reducedMotion, D, restTime]);

  const config = brandedConfig({ ...template.defaultConfig }, template.elementKind, project.brand);
  return (
    <span ref={hostRef} className="relative block aspect-video w-full overflow-hidden bg-black" style={{ containerType: "size" }} aria-hidden="true">
      <span className="pointer-events-none absolute inset-0 block" style={{ transform: `scale(${template.elementKind === "text" || template.elementKind === "logo" ? 1.9 : 1.2})` }}>
        {visible ? <ControlledAnimation
          templateKey={templateKey as ComponentKey}
          config={config}
          localTime={time}
          elementDuration={D}
          timing="fit"
          preview
        /> : null}
      </span>
      {playing ? null : (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wider text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
          ▶
        </span>
      )}
    </span>
  );
}
