import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { customElementKind, type CustomTemplate } from "@/lib/templates/custom-model";
import { DEMO_PROMPTS } from "@/data/prompts";
import { COMPONENT_REGISTRY } from "@/lib/animations/registry";
import { STUDIO_TEMPLATES } from "@/lib/studio/template-registry";

/**
 * Bibliothèque commune — résolution d'un template par id/slug,
 * pour le site public, l'administration, le Studio et les futurs outils MCP.
 *
 * Sources fusionnées, dans l'ordre :
 * 1. Templates codés (7 composants approvés du registre) ;
 * 2. Templates personnalisés publiés (démo : mémoire ;
 *    Supabase : table `custom_templates`, RLS + statut `published`).
 */

import { getCustomTemplateBySlug, listPublishedCustomTemplates } from "./custom-store";

export interface UnifiedTemplate {
  /** URL : /templates/<templateId> */
  templateId: string;
  display: {
    name: string;
    description: string;
    /** Catégorie Studio (ui-motion, text-motion…). */
    category: string;
    slug: string;
  };
  /** Vrai pour les 7 composants codés du registre. */
  builtIn: boolean;
  /** Clé du composant React à monter (builtin ou custom « composant »). */
  componentKey?: ComponentKey;
  custom?: {
    id: string;
    sourceKind: "component" | "code";
    code?: string;
    version: number;
  };
  meta: {
    defaultConfig: AnimationConfig;
    timelineDuration: number;
    elementKind: string;
    technologies: string[];
  };
  prompts: {
    web: string;
    afterEffects: string;
  };
  isFeatured: boolean;
}

export async function listAllPublishedTemplates(): Promise<UnifiedTemplate[]> {
  const builtIns = Object.values(builtinTable);
  const customs = (await listPublishedCustomTemplates()).map(toUnified);
  return [...builtIns, ...customs];
}

export async function resolveTemplate(templateId: string): Promise<UnifiedTemplate | null> {
  const builtin = builtinTable[templateId];
  if (builtin) return builtin;
  const custom = await getCustomTemplateBySlug(templateId);
  if (custom && custom.status === "published") return toUnified(custom);
  return null;
}

export function toUnified(template: CustomTemplate): UnifiedTemplate {
  const baseMeta = template.componentKey ? builtinTable[template.componentKey] : undefined;
  return {
    templateId: template.slug,
    display: {
      name: template.name,
      description: template.description,
      category: template.category,
      slug: template.slug,
    },
    builtIn: false,
    componentKey: template.componentKey,
    custom: {
      id: template.id,
      sourceKind: template.sourceKind,
      code: template.sourceKind === "code" ? template.code : undefined,
      version: template.version,
    },
    meta: {
      defaultConfig: template.defaultConfig,
      timelineDuration: template.defaultConfig.duration,
      elementKind: customElementKind(template),
      technologies: baseMeta ? baseMeta.meta.technologies : ["React", "HTML", "CSS"],
    },
    prompts: {
      web: template.promptWeb,
      afterEffects: template.promptAfterEffects,
    },
    isFeatured: false,
  };
}

/* ------------------------------------------------------------------ */
/* Table intégrée (composants approuvés)                               */
/* ------------------------------------------------------------------ */

const builtinTable: Record<string, UnifiedTemplate> = buildBuiltinTable();

function buildBuiltinTable(): Record<string, UnifiedTemplate> {
  const table: Record<string, UnifiedTemplate> = {};
  for (const [key, meta] of Object.entries(COMPONENT_REGISTRY)) {
    const studioMeta = STUDIO_TEMPLATES[key];
    const prompts = (DEMO_PROMPTS as Record<string, { web: string; after_effects: string }>)[key];
    table[key] = {
      templateId: key,
      display: {
        name: meta.name,
        description: meta.description,
        category: studioMeta ? studioMeta.studioCategory : "text-motion",
        slug: key,
      },
      builtIn: true,
      componentKey: key as ComponentKey,
      meta: {
        defaultConfig: meta.defaultConfig,
        timelineDuration: studioMeta ? studioMeta.timelineDuration : meta.defaultConfig.duration,
        elementKind: studioMeta ? studioMeta.elementKind : "text",
        technologies: meta.technologies,
      },
      prompts: {
        web: prompts?.web ?? "",
        afterEffects: prompts?.after_effects ?? "",
      },
      isFeatured: true,
    };
  }
  return table;
}