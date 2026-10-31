import type { AnimationConfig } from "@/types/animation";
import {
  makeElement,
  serializeProject,
  validateProject,
  type ElementKind,
  type StudioProject,
} from "./project-model";
import { getStudioTemplate, STUDIO_TEMPLATES } from "./template-registry";

/**
 * Contrats MCP — Phase 4.
 *
 * Cette V1 prépare seulement le CONTRAT des outils (entrées/sorties
 * structurées + validation) qu'un serveur MCP exposera (stdio / SSE) plus
 * tard. Jamais de code exécutable : chaque outil manipule uniquement des
 * données validées, les clés de template doivent exister dans le registre
 * Studio et le projet reste soumis à `validateProject`.
 *
 * Sécurité prévue lors de la Phase 4 :
 * - authentification: token par utilisateur (JWT Supabase + session MCP) ;
 * - autorisation: un utilisateur ne pilote que ses projets (RLS côté base) ;
 * - validation: chaque paramètre est vérifié ici, avant mutation ;
 * - projets privés: invisibles aux assistants non autorisés.
 */

export interface McpToolResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): McpToolResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): McpToolResult<T> {
  return { ok: false, error };
}

type ProjectMutation = (project: StudioProject) => StudioProject | null;

export interface McpTool {
  name: string;
  description: string;
  /** Exécute l'outil sur l'état du projet et renvoie l'état sérialisé. */
  run: (project: StudioProject, input: unknown) => McpToolResult<string>;
}

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function runMutation(
  project: StudioProject,
  mutate: ProjectMutation,
  tool: string
): McpToolResult<string> {
  try {
    const next = mutate(project);
    if (!next) return fail(`${tool} : paramètres invalides ou éléments introuvables`);
    validateProject(next);
    return ok(serializeProject(next));
  } catch (e) {
    return fail(`${tool} : ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "list_templates",
    description: "Liste les templates d'animation compatibles (catégorie, type d'élément, propriétés par défaut).",
    run: () => {
      const table: Record<string, { studioCategory: string; elementKind: ElementKind; timelineDuration: number }> = {};
      Object.entries(STUDIO_TEMPLATES).forEach(([key, template]) => {
        table[key] = {
          studioCategory: template.studioCategory,
          elementKind: template.elementKind,
          timelineDuration: template.timelineDuration,
        };
      });
      return ok(JSON.stringify(table));
    },
  },
  {
    name: "get_template_schema",
    description: "Renvoie le schéma de propriétés d'un template (params configurables + défauts).",
    run: (_project, input) => {
      const key = (input as { templateKey?: unknown })?.templateKey;
      if (!isStr(key)) return fail("templateKey requis");
      const template = getStudioTemplate(key);
      if (!template) return fail(`template inconnu : ${String(key)}`);
      return ok(JSON.stringify({ key, config: template.defaultConfig, duration: template.timelineDuration }));
    },
  },
  {
    name: "get_timeline",
    description: "Renvoie la structure temporelle complète du projet (scènes, éléments, durées).",
    run: (project) => ok(serializeProject(project)),
  },
  {
    name: "add_element",
    description: "Ajoute un élément d'animation à une scène à une position/durée données.",
    run: (project, input) => {
      const args = input as Record<string, unknown>;
      const templateKey = args?.templateKey;
      if (!isStr(templateKey)) return fail("templateKey requis");
      const template = getStudioTemplate(templateKey);
      if (!template) return fail(`template inconnu : ${String(templateKey)}`);
      const scene = project.scenes[Number.isFinite(Number(args?.sceneIndex)) ? Number(args.sceneIndex) : 0];
      if (!scene) return fail("sceneIndex invalide");
      const element = makeElement(templateKey, template.elementKind, {
        ...template.defaultConfig,
        text: isStr(args.text) ? args.text.slice(0, 120) : template.defaultConfig.text,
      } as AnimationConfig, {
        start: Number(args.start) || 0,
        duration: Number(args.duration) || template.timelineDuration,
      });
      return runMutation(project, (p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
          s.id === scene.id ? { ...s, elements: [...s.elements, element] } : s
        ),
      }), "add_element");
    },
  },
  {
    name: "split_clip",
    description: "Coupe virtuellement un élément en deux à un temps local donné (mêmes params).",
    run: () => fail("split_clip : disponible avec l’import des médias (Phase 3)"),

  },
];
// Contrats déclarés mais actifs en Phase 4 (serveur MCP) :
// - create_project / create_scene (création côté serveur MCP)
// - update_element / replace_animation / reorder_scenes (mutations avancées)
// - save_project (sauvegarde Supabase, Phase 3)