import type { AnimationConfig, ComponentKey } from "./animation";

export type PromptType = "web" | "after_effects";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface TemplatePrompt {
  id: string;
  animation_id: string;
  type: PromptType;
  content: string;
  version: number;
}

/** Carte de galerie (données minimales, sérialisables en JSON) */
export interface TemplateSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: { name: string; slug: string } | null;
  componentKey: ComponentKey;
  config: AnimationConfig;
  duration: number;
  isFeatured: boolean;
}

/** Page de détail : summary + prompts (utilisé aussi par l'admin). */
export interface TemplateDetail extends TemplateSummary {
  isPublished: boolean;
  prompts: TemplatePrompt[];
  updatedAt: string;
  componentTitle: string;
  technologies: string[];
  componentDescription: string;
}