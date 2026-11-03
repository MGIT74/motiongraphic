"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
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
  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        <span className="lg:hidden">Touchez un template pour l&apos;ajouter à la scène, à la suite des autres éléments.</span>
        <span className="hidden lg:inline">
          Survolez pour voir l&apos;animation. Cliquez pour l&apos;ajouter à la suite, ou glissez-la sur la timeline ou l&apos;aperçu.
        </span>
      </p>
      {STUDIO_CATEGORIES.map((category) => {
        const templates = Object.entries(STUDIO_TEMPLATES).filter(([, t]) => t.studioCategory === category.id);
        if (templates.length === 0) return null;
        return (
          <div key={category.id}>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{category.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(([key, template]) => (
                <TemplateCard key={key} templateKey={key} template={template} project={project} onAdd={() => onAddElement(key)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemplateCard({
  templateKey,
  template,
  project,
  onAdd,
}: {
  templateKey: string;
  template: StudioTemplateMeta;
  project: StudioProject;
  onAdd: () => void;
}) {
  const [active, setActive] = useState(false);
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(TEMPLATE_DRAG_TYPE, templateKey);
    e.dataTransfer.setData("text/plain", template.name);
    e.dataTransfer.effectAllowed = "copy";
    setActive(false);
  };
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-background/60 text-left transition-colors hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none"
      aria-label={`Ajouter ${template.name} (${template.timelineDuration} s)`}
      data-template-card={templateKey}
    >
      <TemplateThumb templateKey={templateKey} template={template} project={project} playing={active} />
      <span className="flex items-center gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">{template.name}</span>
        <span className="shrink-0 font-mono text-[9px] text-muted">{template.timelineDuration}s</span>
        <GripVertical className="h-3 w-3 shrink-0 text-muted/50 group-hover:text-muted" aria-hidden="true" />
      </span>
    </button>
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

  useEffect(() => {
    if (!playing) {
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
  }, [playing, D, restTime]);

  const config = brandedConfig({ ...template.defaultConfig }, template.elementKind, project.brand);
  return (
    <span className="relative block aspect-video w-full overflow-hidden bg-black" style={{ containerType: "size" }} aria-hidden="true">
      <span className="pointer-events-none absolute inset-0 block" style={{ transform: `scale(${template.elementKind === "text" || template.elementKind === "logo" ? 1.9 : 1.2})` }}>
        <ControlledAnimation
          templateKey={templateKey as ComponentKey}
          config={config}
          localTime={time}
          elementDuration={D}
          timing="fit"
          preview
        />
      </span>
      {playing ? null : (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wider text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
          ▶
        </span>
      )}
    </span>
  );
}
