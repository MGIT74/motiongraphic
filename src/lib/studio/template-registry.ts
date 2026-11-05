import type { ElementKind } from "./project-model";
import { getComponentMeta } from "@/lib/animations/registry";
import type { ComponentMeta } from "@/lib/animations/registry";
import type { AnimationConfig } from "@/types/animation";
import type { TemplateCapabilities } from "@/lib/templates/capabilities";

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
  /** Clé du composant intégré dont se sert le moteur (builder + frame) ou
   * du bac à sable (contrat déterministe __MGS_TIMELINE__/renderAt). */
  underlyingComponentKey?: import("@/types/animation").ComponentKey;
  /** Vrai si le moteur du Studio pilote ce template avec le temps (SEEK). */
  timeDriven: boolean;
  /** Code sandboxé (contrat déterministe rendu/seek) si source « code » compatible. */
  sandboxCode?: string;
  /** Raisons d'incompatibilité (templates publiés non pilotables). */
  incompatibility?: string[];
  /** Vrai si le pipeline d'export MP4 (capture image par image) le supporte. */
  exportCompatible?: boolean;
  /** Déclaire par READY du sandbox (durée/outAt exacts + version du template custom). */
  sandboxContract?: { duration: number; outAt?: number };
  sandboxVersion?: number;
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
    code?: string;
    capabilities?: TemplateCapabilities;
    version?: number;
  }[]
): void {
  for (const template of templates) {
    const base = template.componentKey ? STUDIO_TEMPLATES[template.componentKey] : undefined;

    /* ---- source « composant » : pilotable par le builder du composant de base ---- */
    if (template.sourceKind === "component" && template.componentKey && base) {
      STUDIO_TEMPLATES[template.slug] = {
        ...base,
        // Clé propre au template custom (son slug) : distincte du composant de base,
        // sinon il se confond avec le template intégré (même clé React, même choix).
        // Le moteur retrouve le composant via `underlyingComponentKey`.
        key: template.slug as import("@/types/animation").ComponentKey,
        name: template.name,
        studioCategory: (template.category as StudioCategory) ?? base.studioCategory,
        timelineDuration: template.defaultConfig.duration,
      };
      const meta = STUDIO_TEMPLATES[template.slug] as CustomStudioTemplateMeta;
      meta.underlyingComponentKey = template.componentKey as import("@/types/animation").ComponentKey;
      meta.timeDriven = true;
      meta.exportCompatible = true;
      CUSTOM_STUDIO_KEYS.add(template.slug);
      continue;
    }

    /* ---- source « code » : bac à sable déterministe (__MGS_TIMELINE__) ---- */
    if (template.sourceKind === "code" && template.code) {
      const caps = template.capabilities ?? { studioCompatible: true, exportCompatible: true, reasons: [] };
      // Type d'élément dérivé de la catégorie (text-motion => text, etc.) :
      // la compatibilité du remplacement N'EST JAMAIS « undefined == undefined ».
      const kind = kindForCategory(template.category);
      STUDIO_TEMPLATES[template.slug] = {
        // Base structurelle : n'importe quelle méta (sans builder).
        ...baseMetaScaffold(template),
        key: template.slug as import("@/types/animation").ComponentKey,
        name: template.name,
        elementKind: kind,
        studioCategory: (template.category as StudioCategory) ?? "text-motion",
        timelineDuration: template.capabilities?.contractDuration ?? template.defaultConfig.duration,
      } as StudioTemplateMeta;
      const meta = STUDIO_TEMPLATES[template.slug] as CustomStudioTemplateMeta;
      meta.sandboxCode = template.code;
      meta.sandboxVersion = template.version;
      meta.timeDriven = caps.studioCompatible === true;
      meta.exportCompatible = caps.studioCompatible === true;
      meta.technologies = ["HTML", "CSS", "JavaScript"];
      meta.sandboxContract = caps.contractDuration
        ? { duration: caps.contractDuration, outAt: undefined }
        : { duration: template.defaultConfig.duration, outAt: undefined };
      if (!caps.studioCompatible) meta.incompatibility = caps.reasons;
      CUSTOM_STUDIO_KEYS.add(template.slug);
      continue;
    }

    /* ---- entrée catalogue (ajout Studio désactivé, raison affichée) ---- */
    STUDIO_CATALOG_ONLY[template.slug] = {
      id: template.id,
      slug: template.slug,
      name: template.name,
      category: template.category,
      reasons:
        template.capabilities?.reasons ?? ["Ce template n'est pas pilotable par le temps (contrat déterministe absent)."],
    };
  }
}

/** Type d'élément par catégorie Studio (les codes sandbox déclarent par catégorie) —
 * la compatibilité ne peut pas reposer sur un `undefined` implicite. */
function kindForCategory(category: string): ElementKind | "cards" {
  switch (category) {
    case "text-motion": return "text";
    case "logo-motion": return "logo";
    case "transitions": return "shape";
    case "ui-motion":
    case "app-showcase":
    case "data-motion":
    default: return "cards";
  }
}

/** Squelette complet de méta pour l'enregistrement runtime. */
function baseMetaScaffold(template: { name: string; defaultConfig: AnimationConfig }): ComponentMeta {
  return {
    key: template.name.toLowerCase() as never,
    name: template.name,
    description: "",
    technologies: ["HTML", "CSS", "JavaScript"],
    defaultConfig: template.defaultConfig,
  };
}

/** Templates publiés mais non pilotables : affichés désactivés avec raison. */
export const STUDIO_CATALOG_ONLY: Record<string, { id: string; slug: string; name: string; category: string; reasons: string[] }> = {};

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