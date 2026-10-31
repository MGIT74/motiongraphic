import type { AnimationConfig } from "@/types/animation";

import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";
import { listAllPublishedTemplates } from "@/lib/templates/registry";
import {
  makeDefaultProject,
  makeElement,
  makeScene,
  replaceElementTemplate,
  roundToFrame,
  serializeProject,
  updateElement,
  validateProject,
  type StudioProject,
} from "./project-model";

/**
 * Serveur MCP distant (Protocol Model Context, JSON-RPC 2.0, HTTPS) :
 * - transport "Streamable HTTP" minimal (POST /api/mcp, réponses JSON) ;
 * - authentification : Bearer MCP_ACCESS_TOKEN (variable serveur unique) ;
 * - outils = données structurées validées (aucun code exécutable) ;
 * - stockage : table `studio_projects` (migration 0003, RLS côté app / côté
 *   MCP : service_role serveur uniquement + utilisateur cible MCP_USER_ID).
 *
 * NOTE (honnête) : les outils échouent avec un message explicite tant que
 * (a) Supabase n'est pas configuré, (b) la migration 0003 n'est pas exécutée,
 * (c) SUPABASE_SERVICE_ROLE_KEY / MCP_USER_ID / MCP_ACCESS_TOKEN absents.
 */

/* ------------------------------------------------------------------ */
/* Client Supabase du serveur MCP (service_role — NE JAMAIS exposer)   */
/* ------------------------------------------------------------------ */

function mcpConfigCheck(): { ok: true } | { ok: false; reason: string } {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "Supabase non configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY." };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY absente (env serveur) — requise pour les outils MCP." };
  }
  if (!process.env.MCP_USER_ID) {
    return { ok: false, reason: "MCP_USER_ID absent — identifiant de l'utilisateur propriétaire des projets MCP." };
  }
  return { ok: true };
}

interface DbResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Builder thennable + chaînable (type minimal supabase-js v2). */
interface ProjectSelectBuilder extends PromiseLike<DbResult> {
  eq: (col: string, value: string) => ProjectSelectBuilder;
}

interface supabase_project_Update_builder extends PromiseLike<DbResult> {
  eq: (col: string, value: string) => supabase_project_Update_builder;
}

interface SupabaseAdminLike {
  from: (table: "studio_projects") => {
    select: (sel: string) => ProjectSelectBuilder;
    insert: (row: Record<string, unknown>) => PromiseLike<DbResult>;
    update: (row: Record<string, unknown>) => supabase_project_Update_builder;
  };
}

async function adminClient(): Promise<SupabaseAdminLike> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    supabaseUrl() as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  ) as unknown as SupabaseAdminLike;
}

/* ------------------------------------------------------------------ */
/* Store projets (serveur)                                             */
/* ------------------------------------------------------------------ */

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  data: unknown;
  updated_at: string;
}

async function loadProjectRow(projectId: string, userId: string): Promise<StudioProject | null> {
  const client = await adminClient();
  const { data, error } = await client
    .from("studio_projects")
    .select("id, user_id, name, data, updated_at")
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
  const row = (data as ProjectRow[] | null)?.[0];
  if (!row) return null;
  const project = validateProject(row.data ?? null);
  if (!project) throw new McpToolError(`Projet ${projectId} : données non valides (shema/schema version).`);
  return project;
}

async function persistProject(project: StudioProject, userId: string): Promise<void> {
  const client = await adminClient();
  const { error } = await client
    .from("studio_projects")
    .update({
      name: project.name,
      fps: project.fps,
      width: project.width,
      height: project.height,
      data: JSON.parse(serializeProject(project)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .eq("user_id", userId);
  if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
}

function mapDbError(error: { message: string }): string {
  return `Supabase : ${error.message}`;
}

function hintMigration(): string {
  return "Exécutez supabase/migrations/0003_studio_projects.sql dans le SQL Editor (autorisation requise).";
}



/* ------------------------------------------------------------------ */
/* Outils MCP                                                          */
/* ------------------------------------------------------------------ */

type McpInput = Record<string, unknown>;

function needString(input: McpInput, key: string, label = key): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new McpToolError(`Paramètre requis : ${label} (chaîne).`);
  }
  return value.trim().slice(0, 120);
}

function optNumber(input: McpInput, key: string): number | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function needIndex(input: McpInput, project: StudioProject, key = "scene_index"): number {
  const idx = optNumber(input, key);
  const i = Math.trunc(idx ?? 0);
  if (i < 0 || i >= project.scenes.length) {
    throw new McpToolError(`${key} invalide (0..${project.scenes.length - 1}).`);
  }
  return i;
}

export const MCP_PROJECT_TOOLS = [
  {
    name: "list_templates",
    description: "Liste les templates d'animation publiés (intégrés + custom admin) avec catégorie, type d'élément et durée.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const templates = await listAllPublishedTemplates();
      return JSON.stringify(
        templates.map((t) => ({
          template_key: t.templateId,
          name: t.display.name,
          category: t.display.category,
          element_kind: t.meta.elementKind,
          duration: t.meta.timelineDuration,
          source: t.builtIn ? "builtin" : "custom",
        }))
      );
    },
  },
  {
    name: "get_template_schema",
    description: "Schéma de config d'un template (paramètres + valeurs par défaut + durée timeline).",
    inputSchema: { type: "object", required: ["template_key"], properties: { template_key: { type: "string" } } },
    run: async (input: McpInput) => {
      const key = needString(input, "template_key");
      const templates = await listAllPublishedTemplates();
      const template = templates.find((t) => t.templateId === key);
      if (!template) throw new McpToolError(`Template inconnu : ${key}`);
      return JSON.stringify({
        template_key: template.templateId,
        name: template.display.name,
        category: template.display.category,
        element_kind: template.meta.elementKind,
        timeline_duration: template.meta.timelineDuration,
        config: template.meta.defaultConfig,
      });
    },
  },
  {
    name: "create_project",
    description: "Crée un projet Studio (squelette type marketing SaaS) et renvoie son id + timeline.",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : undefined;
      const project = makeDefaultProject(name || "Projet MCP");
      const client = await adminClient();
      const { error } = await client.from("studio_projects").insert({
        id: project.id,
        user_id: userId,
        name: project.name,
        schema_version: project.schemaVersion,
        fps: project.fps,
        width: project.width,
        height: project.height,
        data: JSON.parse(serializeProject(project)),
      });
      if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
      return JSON.stringify({ project_id: project.id, name: project.name });
    },
  },
  {
    name: "create_scene",
    description: "Ajoute une scène à la fin d'un projet.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        name: { type: "string" },
        duration: { type: "number" },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const projectId = needString(input, "project_id", "project_id");
      const userId = process.env.MCP_USER_ID as string;
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId} (privé ou inexistant).`);
      const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) || "Scène" : `Scène ${project.scenes.length + 1}`;
      const duration = roundToFrame(Math.max(1, Math.min(600, optNumber(input, "duration") ?? 5)));
      const next = { ...project, scenes: [...project.scenes, makeScene(name, duration)] };
      validateProject(next);
      await persistProject(next, userId);
      return JSON.stringify({ project_id: projectId, scene_count: next.scenes.length, scenes: next.scenes.map((s) => ({ id: s.id, name: s.name })) });
    },
  },
  {
    name: "add_element",
    description: "Ajoute un élément d'animation (template publié) à une scène du projet.",
    inputSchema: {
      type: "object",
      required: ["project_id", "template_key"],
      properties: {
        project_id: { type: "string" },
        scene_index: { type: "number" },
        template_key: { type: "string" },
        start: { type: "number" },
        duration: { type: "number" },
        text: { type: "string" },
        primary_color: { type: "string" },
        accent_color: { type: "string" },
        background_color: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        scale: { type: "number" },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const projectId = needString(input, "project_id", "project_id");
      const templateKey = needString(input, "template_key", "template_key");
      const userId = process.env.MCP_USER_ID as string;
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId} (privé ou inexistant).`);
      const sceneIdx = needIndex(input, project);

      const template = (await listAllPublishedTemplates()).find((t) => t.templateId === templateKey);
      if (!template) throw new McpToolError(`Template inconnu ou non publié : ${templateKey}`);

      const config: AnimationConfig = {
        ...template.meta.defaultConfig,
        text: typeof input.text === "string" ? input.text.slice(0, 120) : template.meta.defaultConfig.text,
      };
      if (typeof input.primary_color === "string") config.primaryColor = input.primary_color;
      if (typeof input.accent_color === "string") config.accentColor = input.accent_color;
      if (typeof input.background_color === "string") config.backgroundColor = input.background_color;

      const element = makeElement(template.templateId, template.meta.elementKind as never, config, {
        start: optNumber(input, "start") ?? currentSceneEnd(project, sceneIdx),
        duration: optNumber(input, "duration") ?? template.meta.timelineDuration,
        x: optNumber(input, "x"),
        y: optNumber(input, "y"),
        scale: optNumber(input, "scale"),
        label: template.display.name,
      });

      const next = {
        ...project,
        scenes: project.scenes.map((scene, i) =>
          i === sceneIdx ? { ...scene, elements: [...scene.elements, element] } : scene
        ),
      };
      validateProject(next);
      await persistProject(next, userId);
      return JSON.stringify({ ok: true, element_id: element.id, scene_index: sceneIdx, total_elements: project.scenes[sceneIdx].elements.length });
    },
  },
  {
    name: "update_element",
    description: "Met à jour un élément de timeline (durée, position, échelle, libellé, config).",
    inputSchema: {
      type: "object",
      required: ["project_id", "element_id"],
      properties: {
        project_id: { type: "string" },
        element_id: { type: "string" },
        scene_index: { type: "number" },
        start: { type: "number" },
        duration: { type: "number" },
        label: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        scale: { type: "number" },
        text: { type: "string" },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const projectId = needString(input, "project_id", "project_id");
      const elementId = needString(input, "element_id", "element_id");
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId}.`);
      const located = findLocated(project, elementId);

      const next = updateElement(project, located.scene.id, elementId, (el) => {
        const patched: typeof el = { ...el };
        if (optNumber(input, "start") !== undefined) patched.start = roundToFrame(Math.max(0, Math.min(600, optNumber(input, "start") as number)));
        if (optNumber(input, "duration") !== undefined) patched.duration = roundToFrame(Math.max(0.5, Math.min(120, optNumber(input, "duration") as number)));
        if (optNumber(input, "x") !== undefined) patched.x = Math.max(0, Math.min(100, optNumber(input, "x") as number));
        if (optNumber(input, "y") !== undefined) patched.y = Math.max(0, Math.min(100, optNumber(input, "y") as number));
        if (optNumber(input, "scale") !== undefined) patched.scale = Math.max(0.2, Math.min(3, optNumber(input, "scale") as number));
        if (typeof input.label === "string") patched.label = input.label.slice(0, 60);
        if (typeof input.text === "string") patched.config = { ...patched.config, text: input.text.slice(0, 120) };
        return patched;
      });
      validateProject(next);
      validateLocated(next, projectId, located);
      await persistProject(next, userId);
      return JSON.stringify({ ok: true });
    },
  },
  {
    name: "replace_animation",
    description: "Remplace le template d'un élément par un autre COMPATIBLE (même type), sans perdre contenu/durée.",
    inputSchema: {
      type: "object",
      required: ["project_id", "element_id", "new_template_key"],
      properties: {
        project_id: { type: "string" },
        element_id: { type: "string" },
        scene_index: { type: "number" },
        new_template_key: { type: "string" },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const projectId = needString(input, "project_id", "project_id");
      const elementId = needString(input, "element_id", "element_id");
      const newKey = needString(input, "new_template_key", "new_template_key");
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId}.`);
      const located = findLocated(project, elementId);
      const next = replaceElementTemplate(project, located.scene.id, elementId, newKey);
      if (!next) {
        throw new McpToolError(`Remplacement refusé : ${newKey} est absent du registre ou incompatible avec le type « ${located.element.kind} ».`);
      }
      validateProject(next);
      await persistProject(next, userId);
      return JSON.stringify({ ok: true, template_key: newKey });
    },
  },
  {
    name: "reorder_scenes",
    description: "Réordonne les scènes d'un projet (liste d'ids dans le nouvel ordre).",
    inputSchema: {
      type: "object",
      required: ["project_id", "scene_ids"],
      properties: {
        project_id: { type: "string" },
        scene_ids: { type: "array", items: { type: "string" } },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const projectId = needString(input, "project_id", "project_id");
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId}.`);
      const ids = (input.scene_ids as unknown[] | undefined);
      if (!Array.isArray(ids) || ids.length !== project.scenes.length || !ids.every((id) => typeof id === "string")) {
        throw new McpToolError("scene_ids doit contenir tous les ids de scènes, chacun une fois.");
      }
      const byId = new Map(project.scenes.map((scene) => [scene.id, scene]));
      const reordered = (ids as string[]).map((id) => byId.get(id)).filter(Boolean) as StudioProject["scenes"];
      if (reordered.length !== project.scenes.length) throw new McpToolError("ids de scènes inconnus.");
      const next = { ...project, scenes: reordered };
      validateProject(next);
      await persistProject(next, userId);
      return JSON.stringify({ ok: true, order: reordered.map((scene) => scene.id) });
    },
  },
  {
    name: "get_timeline",
    description: "Renvoie la timeline complète du projet (scènes, éléments, configs, durées).",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" } },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const projectId = needString(input, "project_id", "project_id");
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId} (privé ou inexistant).`);
      return serializeProject(project);
    },
  },
  {
    name: "save_project",
    description: "Persiste explicitement un projet tel quel (validateProject obligatoire) ou sauvegarde l'état courant.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" }, name: { type: "string" } },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const projectId = needString(input, "project_id", "project_id");
      const project = await loadProjectRow(projectId, userId);
      if (!project) throw new McpToolError(`Projet introuvable : ${projectId}.`);
      const next = typeof input.name === "string" ? { ...project, name: input.name.trim().slice(0, 120) || project.name } : project;
      validateProject(next);
      await persistProject(next, userId);
      return JSON.stringify({ ok: true, project_id: projectId, name: next.name, updated_at: new Date().toISOString() });
    },
  },
  {
    name: "split_clip",
    description: "Découpe virtuelle d'un clip média (In/Out) — dépend de l'import de médias.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" } } },
    run: async () => {
      throw new McpToolError("split_clip : nécessite l'import de médias (Phase 3) — outil déclaré, non actif.");
    },
  },
];

function currentSceneEnd(project: StudioProject, sceneIdx: number): number {
  const scene = project.scenes[sceneIdx];
  let end = 0;
  scene.elements.forEach((el) => (end = Math.max(end, el.start + el.duration)));
  return end;
}

interface Located {
  scene: StudioProject["scenes"][number];
  element: StudioProject["scenes"][number]["elements"][number];
}

function findLocated(project: StudioProject, elementId: string): Located {
  for (const scene of project.scenes) {
    const element = scene.elements.find((el) => el.id === elementId);
    if (element) return { scene, element };
  }
  throw new McpToolError(`Élément introuvable : ${elementId}`);
}

function validateLocated(project: StudioProject, projectId: string, located: Located): void {
  const scene = project.scenes.find((s) => s.id === located.scene.id);
  if (!scene) throw new McpToolError(`Projet ${projectId} : structure invalide après mise à jour.`);
  if (!scene.elements.some((el) => el.id === located.element.id)) {
    throw new McpToolError(`Élément ${located.element.id} perdu lors de la mise à jour.`);
  }
}

export class McpToolError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}