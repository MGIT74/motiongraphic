import type { TemplateSummary } from "@/types/template";
import type { CustomTemplate } from "./custom-model";
import { STUDIO_CATEGORIES } from "@/lib/studio/template-registry";

/**
 * Convertit un template personnalisé en carte de galerie (TemplateSummary).
 * La catégorie affichée : libellé de la catégorie Studio choisie en admin.
 */
export function toCustomSummary(template: CustomTemplate): TemplateSummary {
  const categoryLabel =
    STUDIO_CATEGORIES.find((c) => c.id === template.category)?.label ?? template.category;

  return {
    id: template.id,
    title: template.name,
    slug: template.slug,
    description: template.description,
    category: { name: categoryLabel, slug: template.category },
    componentKey: template.componentKey,
    config: template.defaultConfig,
    duration: template.defaultConfig.duration,
    isFeatured: false,
    custom: {
      id: template.id,
      sourceKind: template.sourceKind,
      code: template.sourceKind === "code" ? template.code : undefined,
      version: template.version,
    },
  };
}