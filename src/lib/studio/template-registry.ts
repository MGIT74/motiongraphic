import type { ElementKind } from "./project-model";
import { getComponentMeta } from "@/lib/animations/registry";
import type { ComponentMeta } from "@/lib/animations/registry";

/**
 * Registre Studio — couche au-dessus du registre public :
 * classe chaque template par type d'élément et catégorie SaaS
 * (voir aussi docs/studio-architecture.md).
 *
 * Les composants d'animation restent des composants React compilés :
 * le Studio sélectionne par clé, ne téléverse jamais de code.
 */

export type StudioCategory =
  | "text-motion"
  | "ui-motion"
  | "app-showcase"
  | "data-motion"
  | "transitions"
  | "logo-motion";

export interface StudioTemplateMeta extends ComponentMeta {
  elementKind: ElementKind;
  studioCategory: StudioCategory;
  /** Durée par défaut d'un élément de timeline utilisant ce template. */
  timelineDuration: number;
}

export function extendMeta(base: ComponentMeta, overrides: Partial<StudioTemplateMeta>): StudioTemplateMeta {
  return {
    ...base,
    ...overrides,
    elementKind: overrides.elementKind ?? "text",
    studioCategory: overrides.studioCategory ?? "text-motion",
    timelineDuration: overrides.timelineDuration ?? base.defaultConfig.duration,
  };
}

export const STUDIO_TEMPLATES: Record<string, StudioTemplateMeta> = {
  "kinetic-type-01": extendMeta(getComponentMeta("kinetic-type-01"), {
    elementKind: "text",
    studioCategory: "text-motion",
    timelineDuration: 4,
  }),
  "text-reveal-01": extendMeta(getComponentMeta("text-reveal-01"), {
    elementKind: "text",
    studioCategory: "text-motion",
    timelineDuration: 4,
  }),
  "elastic-text-01": extendMeta(getComponentMeta("elastic-text-01"), {
    elementKind: "text",
    studioCategory: "text-motion",
    timelineDuration: 3.5,
  }),
  "shape-morph-01": extendMeta(getComponentMeta("shape-morph-01"), {
    elementKind: "shape",
    studioCategory: "ui-motion",
    timelineDuration: 5,
  }),
  "staggered-cards-01": extendMeta(getComponentMeta("staggered-cards-01"), {
    elementKind: "cards",
    studioCategory: "ui-motion",
    timelineDuration: 5,
  }),
  "logo-reveal-01": extendMeta(getComponentMeta("logo-reveal-01"), {
    elementKind: "logo",
    studioCategory: "logo-motion",
    timelineDuration: 4.4,
  }),
};

export const STUDIO_CATEGORIES: { id: StudioCategory; label: string }[] = [
  { id: "text-motion", label: "Text Motion" },
  { id: "ui-motion", label: "UI Motion" },
  { id: "app-showcase", label: "App Showcase" },
  { id: "data-motion", label: "Data Motion" },
  { id: "transitions", label: "Transitions" },
  { id: "logo-motion", label: "Logo Motion" },
];

/** Templates compatibles avec un type d'élément. */
export function templatesForKind(kind: ElementKind): StudioTemplateMeta[] {
  return Object.values(STUDIO_TEMPLATES).filter((t) => t.elementKind === kind);
}

export function getStudioTemplate(templateKey: string): StudioTemplateMeta | null {
  return STUDIO_TEMPLATES[templateKey] ?? null;
}