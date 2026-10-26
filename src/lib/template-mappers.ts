import type { AnimationConfig, ComponentKey } from "@/types/animation";
import type { TemplateDetail, TemplateSummary } from "@/types/template";
import { getComponentMeta, isComponentKey } from "@/lib/animations/registry";
import { sanitizeConfigByKey } from "@/lib/animations/config";

/** Champs à sélectionner côté Supabase pour une animation avec sa catégorie. */
export const ANIMATION_SELECT =
  "id, title, slug, description, component_key, default_config, duration, is_published, is_featured, created_at, updated_at, category:categories(id, name, slug)";

/** Ligne brute de la table `animations` telle que renvoyée par Supabase. */
export interface AnimationRowLike {
  id: string;
  title: string;
  slug: string;
  description: string;
  component_key: string;
  default_config: unknown;
  duration: number;
  is_published: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  category?: { name: string; slug: string } | null;
}

type PromptRowLike = TemplateDetail["prompts"][number];

export function toSummary(row: AnimationRowLike): TemplateSummary {
  const componentKey: ComponentKey = isComponentKey(row.component_key)
    ? row.component_key
    : "kinetic-type-01";
  const config: AnimationConfig = sanitizeConfigByKey(componentKey, row.default_config);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category: row.category ? { name: row.category.name, slug: row.category.slug } : null,
    componentKey,
    config,
    duration: row.duration ?? config.duration,
    isFeatured: row.is_featured,
  };
}

export function toDetail(row: AnimationRowLike, prompts: PromptRowLike[], updatedAt: string): TemplateDetail {
  const summary = toSummary(row);
  const meta = getComponentMeta(summary.componentKey);
  return {
    ...summary,
    isPublished: row.is_published,
    prompts: prompts
      .filter((p) => p.type === "web" || p.type === "after_effects")
      .map((p) => ({ ...p, type: p.type as "web" | "after_effects" }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "web" ? -1 : 1;
        return 0;
      }),
    updatedAt,
    componentTitle: meta.name,
    technologies: meta.technologies,
    componentDescription: meta.description,
  };
}