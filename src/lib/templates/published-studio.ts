import "server-only";
import type { AnimationConfig } from "@/types/animation";
import { customElementKind, type CustomTemplate } from "@/lib/templates/custom-model";
import { computeCodeCapabilities, type TemplateCapabilities } from "@/lib/templates/capabilities";
import { listPublishedCustomTemplates } from "@/lib/templates/custom-store";

/**
 * Source unique des templates personnalisés publiés pour le STUDIO
 * (bibliothèque, canvas, timeline) et le pipeline de rendu MP4.
 *
 * Toutes les entrées (source « composant » et « code ») sortent ici avec
 * leurs capacités (compatibilité timeline/export calculée depuis le code,
 * voir docs/template-lab-studio-pipeline.md). Les fichiers qui consomment
 * (pages studio, render, MCP) n'ont PLUS À filtrer : un template publié
 * apparaît, compatible ou pas (le Studio affiche la raison, désactivé).
 */
export interface StudioCustomTemplateInput {
  id: string;
  slug: string;
  name: string;
  category: string;
  sourceKind: string;
  componentKey?: string;
  elementKind: string;
  defaultConfig: AnimationConfig;
  /** Source « code » : code brut (rendu exclusivement en bac à sable). */
  code?: string;
  capabilities?: TemplateCapabilities;
  version: number;
}

export async function listStudioCustomTemplates(): Promise<StudioCustomTemplateInput[]> {
  let published: CustomTemplate[] = [];
  try {
    published = await listPublishedCustomTemplates();
  } catch {
    return [];
  }
  return published.map((t) => {
    const capabilities = t.sourceKind === "code" && t.code ? computeCodeCapabilities(t.code) : undefined;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      category: t.category,
      sourceKind: t.sourceKind,
      componentKey: t.componentKey,
      elementKind: customElementKind(t),
      defaultConfig: t.defaultConfig,
      code: t.sourceKind === "code" ? t.code : undefined,
      capabilities,
      version: t.version,
    };
  });
}