"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { TemplateSummary } from "@/types/template";
import { getComponentMeta } from "@/lib/animations/registry";
import AnimationPlayer from "@/components/animations/AnimationPlayer";
import { useNearViewport } from "@/components/animations/use-near-viewport";
import SandboxPreview, { type AnimationConfigLite } from "@/components/templates/SandboxPreview";

/**
 * Carte de la galerie. Le composant d'animation est monté uniquement
 * lorsqu'il approche du viewport (rendu différé) et se met en pause
 * hors écran via le moteur. Couplage minimal : la carte ne connaît que
 * `componentKey` + `config` — ou le bac à sable isolé pour les
 * templates personnalisés « code source ».
 */
export default function AnimationCard({ template }: { template: TemplateSummary }) {
  const { ref, visible } = useNearViewport<HTMLDivElement>();
  const meta = template.componentKey ? getComponentMeta(template.componentKey) : null;

  const preview = template.custom?.sourceKind === "code" && template.custom.code ? (
    <SandboxPreview
      code={template.custom.code}
      config={template.config as AnimationConfigLite}
      ariaLabel={template.title}
    />
  ) : template.componentKey ? (
    <AnimationPlayer
      componentKey={template.componentKey}
      config={template.config}
      active={visible}
      className="absolute inset-0"
    />
  ) : null;

  return (
    <div ref={ref} className="group relative">
      <Link
        href={`/templates/${template.slug}`}
        className="block overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_24px_60px_-28px_rgba(10,132,255,0.35)] focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`${template.title} — catégorie ${template.category?.name ?? "n/a"}`}
      >
        <div className="relative aspect-video w-full">
          {preview ?? (
            <div className="absolute inset-0 bg-surface" style={{ backgroundColor: template.config.backgroundColor }} />
          )}
        </div>

        <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-sm font-semibold text-ink">{template.title}</h3>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {template.category ? (
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                {template.category.name}
              </span>
            ) : null}
            {(meta?.technologies ?? []).slice(0, 3).map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
}