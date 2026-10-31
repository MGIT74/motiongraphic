import type { ElementKind } from "./project-model";
import { getComponentMeta } from "@/lib/animations/registry";
import type { ComponentMeta } from "@/lib/animations/registry";
import type { AnimationConfig } from "@/types/animation";

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

/* ------------------------------------------------------------------ */
/* Templates personnalisés (publiés) — registre runtime étendu          */
/* ------------------------------------------------------------------ */

export interface CustomStudioTemplateMeta extends StudioTemplateMeta {
  /** Clé du composant intégré dont se sert le moteur (builder + frame). */
  underlyingComponentKey: import("@/types/animation").ComponentKey;
  /** Vrai si le template custom est de type composant (pilotable par la timeline). */
  timeDriven: boolean;
}

/**
 * Enregistre les templates personnalisés PUBLIÉS issus de la bibliothèque
 * commune (appelé par l'application Studio au montage). Un template
 * « composant » est pilotable par la timeline : il se sert du builder et
 * du frame du composant de base dont il dérive. Un template « code » est
 * présent pour le catalogue mais NON pilotable (Phase 2 : pipeline
 * de compilation) — il n'apparaît pas dans les styles de timeline.
 */
export function registerCustomStudioTemplates(
  templates: readonly {
    id: string;
    slug: string;
    name: string;
    category: string;
    sourceKind: string;
    componentKey?: string;
    elementKind: string;
    defaultConfig: AnimationConfig;
  }[]
): void {
  for (const template of templates) {
    const base = template.componentKey ? STUDIO_TEMPLATES[template.componentKey] : undefined;
    const timeDriven = Boolean(base);
    if (!template.componentKey || !base) continue; // templates « code » : hors timeline (Phase 2)
    STUDIO_TEMPLATES[template.slug] = {
      ...base,
      key: template.componentKey as import("@/types/animation").ComponentKey,
      name: template.name,
      studioCategory: (template.category as StudioCategory) ?? base.studioCategory,
      timelineDuration: template.defaultConfig.duration,
    };
    const meta = STUDIO_TEMPLATES[template.slug] as CustomStudioTemplateMeta;
    meta.underlyingComponentKey = (template.componentKey as import("@/types/animation").ComponentKey) ?? base.key;
    meta.timeDriven = timeDriven;
    CUSTOM_STUDIO_KEYS.add(template.slug);
  }
}

/** Clés runtime des templates custom enregistrés (pour validateProject). */
export const CUSTOM_STUDIO_KEYS = new Set<string>();

/** Clé de timeline valide : template intégré OU custom enregistré. */
export function isStudioTemplateKey(key: string): boolean {
  return key in STUDIO_TEMPLATES;
}

/** Résolution du composant de base (builder/frame) pour une clé de timeline. */
export function underlyingComponentKeyOf(templateKey: string): import("@/types/animation").ComponentKey | undefined {
  const meta = STUDIO_TEMPLATES[templateKey];
  if (!meta) return undefined;
  const custom = meta as CustomStudioTemplateMeta;
  return custom.underlyingComponentKey ?? (custom.key as import("@/types/animation").ComponentKey);
}