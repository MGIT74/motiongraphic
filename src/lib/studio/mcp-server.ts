import type { AnimationConfig } from "@/types/animation";

import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";
import { listAllPublishedTemplates } from "@/lib/templates/registry";
import { listPublishedCustomTemplates } from "@/lib/templates/custom-store";
import { customElementKind } from "@/lib/templates/custom-model";
import { registerCustomStudioTemplates } from "./template-registry";
import { isSafeColor } from "@/lib/animations/config";
import { BRAND_FONTS, isBrandFont } from "@/lib/brand/fonts";
import {
  addMediaAsset,
  applyBrand,
  brandedConfig,
  ELEMENT_TIMINGS,
  insertMediaElement,
  makeMediaElement,
  MEDIA_ENTERS,
  MEDIA_FITS,
  MEDIA_FRAMES,
  MEDIA_MOTIONS,
  sanitizeAudio,
  sanitizeMediaOptions,
  setProjectAudio,
  type MediaAsset,
  formatOf,
  makeDefaultProject,
  makeElement,
  makeScene,
  moveElementLayer,
  PROJECT_FORMATS,
  removeElement,
  removeScene,
  sanitizeBrand,
  setProjectFormat,
  updateScene,
  duplicateProject,
  duplicateScene,
  SCENE_TRANSITIONS,
  type SceneTransition,
  type ElementKind,
  type ElementTiming,
  type ProjectFormat,
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
  select: (sel: string) => PromiseLike<DbResult>;
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

/**
 * Enregistre les templates custom PUBLIÉS (source « composant ») dans le registre
 * Studio côté serveur, comme le fait la page /studio : sans cela, validateProject
 * rejette tout projet contenant un template custom (ex. cta-hero-demo).
 */
async function ensureCustomTemplatesRegistered(): Promise<void> {
  try {
    const published = await listPublishedCustomTemplates();
    registerCustomStudioTemplates(
      published
        .filter((t) => t.sourceKind === "component" && t.componentKey)
        .map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          category: t.category,
          sourceKind: t.sourceKind,
          componentKey: t.componentKey,
          elementKind: customElementKind(t),
          defaultConfig: t.defaultConfig,
        }))
    );
  } catch {
    // Source custom indisponible : seuls les templates intégrés seront valides.
  }
}

/** Valide le projet AVANT tout enregistrement : un projet invalide n'est jamais persisté. */
function requireValid(project: StudioProject): StudioProject {
  const valid = validateProject(project);
  if (!valid) {
    throw new McpToolError(
      "Projet refusé : la validation a échoué (template inconnu ou non publié, ou valeurs hors limites). Rien n'a été enregistré."
    );
  }
  return valid;
}

async function loadProjectRow(projectId: string, userId: string): Promise<StudioProject | null> {
  await ensureCustomTemplatesRegistered();
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
  loadedVersions.set(project, row.updated_at);
  return project;
}

/** Version (`updated_at`) de chaque projet chargé : verrou optimiste à l'écriture. */
const loadedVersions = new WeakMap<StudioProject, string>();

/**
 * Enregistre `project` uniquement si la version en base est toujours celle de
 * `base` (le projet chargé au début de l'outil) : une modification faite entre-temps
 * dans le Studio (ou par un autre appel MCP) n'est jamais écrasée.
 */
async function persistProject(project: StudioProject, userId: string, base: StudioProject): Promise<void> {
  const client = await adminClient();
  const version = loadedVersions.get(base);
  let query = client
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
  if (version) query = query.eq("updated_at", version);
  const { data, error } = await query.select("id");
  if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
  if (!Array.isArray(data) || data.length === 0) {
    throw new McpToolError(
      "Conflit : le projet a été modifié entre-temps (Studio ouvert ou autre appel). Rien n'a été écrasé — relancez l'opération."
    );
  }
}

/** Lien pour ouvrir le projet dans le Studio (réservé aux admins connectés en mode construction). */
function studioUrl(projectId: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://motiongraphic.si").replace(/\/+$/, "");
  return `${base}/studio?project=${encodeURIComponent(projectId)}`;
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

/** Résultat d'un outil : texte (JSON) ou contenu MCP riche (image…). */
export type McpToolOutput =
  | string
  | { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] };

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

const FONT_IDS = BRAND_FONTS.map((f) => f.id);
const STYLE_PROPERTIES = {
  primary_color: { type: "string", description: "Couleur principale (#RRGGBB)." },
  accent_color: { type: "string", description: "Couleur d'accent (#RRGGBB)." },
  background_color: { type: "string", description: "Fond de l'élément (#RRGGBB ou 'transparent')." },
  transparent: { type: "boolean", description: "true = fond transparent : le calque se superpose aux calques inférieurs." },
  speed: { type: "number", description: "Vitesse de l'animation (0.25 à 3)." },
  font_family: { type: "string", enum: FONT_IDS, description: "Police de la liste blanche." },
  timing: {
    type: "string",
    enum: ELEMENT_TIMINGS,
    description: "fit = entrée, maintien, sortie terminée à la fin de l'élément ; hold = figé à la fin sans sortie ; natural = vitesse d'origine (coupée).",
  },
} as const;

/** Applique les réglages de style (couleurs, transparence, vitesse, police) à une config. */
function applyStyle(config: AnimationConfig, input: McpInput): AnimationConfig {
  const next = { ...config };
  if (isSafeColor(input.primary_color)) next.primaryColor = input.primary_color as string;
  if (isSafeColor(input.accent_color)) next.accentColor = input.accent_color as string;
  if (isSafeColor(input.background_color)) next.backgroundColor = input.background_color as string;
  if (input.transparent === true) next.backgroundColor = "transparent";
  if (input.transparent === false && next.backgroundColor === "transparent") next.backgroundColor = "#000000";
  const speed = optNumber(input, "speed");
  if (speed !== undefined) next.speed = Math.max(0.25, Math.min(3, speed));
  if (isBrandFont(input.font_family)) next.fontFamily = input.font_family as string;
  return next;
}

function optTiming(input: McpInput): ElementTiming | undefined {
  return ELEMENT_TIMINGS.includes(input.timing as ElementTiming) ? (input.timing as ElementTiming) : undefined;
}

const MEDIA_PROPERTIES = {
  fit: { type: "string", enum: MEDIA_FITS, description: "cover = remplit le cadre ; contain = image entière." },
  frame: { type: "string", enum: MEDIA_FRAMES, description: "Habillage : aucun, fenêtre de navigateur (idéal pour une capture d'écran d'app web) ou téléphone." },
  motion: { type: "string", enum: MEDIA_MOTIONS, description: "Mouvement lent pendant l'élément." },
  enter: { type: "string", enum: MEDIA_ENTERS, description: "Entrée (et sortie si timing = fit)." },
  trim_start: { type: "number", description: "Vidéo : instant de départ dans le fichier (s)." },
} as const;

/** Applique les réglages média passés à l'outil. */
function applyMediaOptions(current: import("./project-model").MediaOptions, input: McpInput) {
  return sanitizeMediaOptions({
    ...current,
    ...(input.fit !== undefined ? { fit: input.fit } : {}),
    ...(input.frame !== undefined ? { frame: input.frame } : {}),
    ...(input.motion !== undefined ? { motion: input.motion } : {}),
    ...(input.enter !== undefined ? { enter: input.enter } : {}),
    ...(input.trim_start !== undefined ? { trimStart: input.trim_start } : {}),
  }) ?? current;
}

/** Résumé d'un média pour les réponses MCP. */
function assetSummary(asset: MediaAsset) {
  return {
    asset_id: asset.id,
    kind: asset.kind,
    name: asset.name,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
    size_mb: asset.sizeBytes ? Math.round((asset.sizeBytes / 1048576) * 10) / 10 : null,
  };
}

/** Enregistre un nouveau média dans la bibliothèque du projet. */
async function storeAsset(input: McpInput, make: (userId: string, projectId: string) => Promise<MediaAsset>) {
  const { project, projectId, userId } = await needProject(input);
  const asset = await make(userId, projectId);
  // Recharge le projet (l'import peut durer) puis ajoute l'asset avec le verrou de version.
  const fresh = (await loadProjectRow(projectId, userId)) ?? project;
  await persistProject(requireValid(addMediaAsset(fresh, asset)), userId, fresh);
  return JSON.stringify({ ok: true, ...assetSummary(asset), studio_url: studioUrl(projectId), hint: "Placez-le avec add_media_element (images/vidéos) ou set_audio (musique)." });
}

const TRANSITION_PROPERTIES = {
  transition: {
    type: "string",
    enum: SCENE_TRANSITIONS,
    description: "Transition d'entrée depuis la scène précédente : none (coupe), fade, slide-left, slide-up, wipe, zoom.",
  },
  transition_duration: { type: "number", description: "Durée de la transition (0,2 à 2 s, défaut 0,6)." },
} as const;

/** Transition demandée (undefined = inchangée, null = aucune). */
function optTransition(input: McpInput, current?: SceneTransition): SceneTransition | null | undefined {
  if (input.transition === undefined && input.transition_duration === undefined) return undefined;
  const type = (input.transition ?? current?.type ?? "fade") as SceneTransition["type"];
  if (!SCENE_TRANSITIONS.includes(type)) throw new McpToolError(`transition invalide : ${SCENE_TRANSITIONS.join(", ")}.`);
  if (type === "none") return null;
  return { type, duration: optNumber(input, "transition_duration") ?? current?.duration ?? 0.6 };
}

/** Scène ciblée par scene_id OU scene_index. */
function needScene(input: McpInput, project: StudioProject): number {
  if (typeof input.scene_id === "string") {
    const i = project.scenes.findIndex((s) => s.id === input.scene_id);
    if (i < 0) throw new McpToolError(`Scène introuvable : ${input.scene_id}`);
    return i;
  }
  return needIndex(input, project);
}

/** Charge le projet (ou lève une erreur explicite). */
async function needProject(input: McpInput): Promise<{ project: StudioProject; projectId: string; userId: string }> {
  const conf = mcpConfigCheck();
  if (!conf.ok) throw new McpToolError(conf.reason);
  const userId = process.env.MCP_USER_ID as string;
  const projectId = needString(input, "project_id", "project_id");
  const project = await loadProjectRow(projectId, userId);
  if (!project) throw new McpToolError(`Projet introuvable : ${projectId} (privé ou inexistant).`);
  return { project, projectId, userId };
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
    description: "Crée un projet Studio (squelette type marketing SaaS : 2 scènes) et renvoie son id + le lien studio_url pour l'ouvrir.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        format: { type: "string", enum: Object.keys(PROJECT_FORMATS), description: "16:9 (défaut), 9:16 (vertical) ou 1:1." },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : undefined;
      const format = (Object.keys(PROJECT_FORMATS) as ProjectFormat[]).includes(input.format as ProjectFormat)
        ? (input.format as ProjectFormat)
        : "16:9";
      const project = makeDefaultProject(name || "Projet MCP", { format });
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
      return JSON.stringify({ project_id: project.id, name: project.name, studio_url: studioUrl(project.id) });
    },
  },
  {
    name: "list_projects",
    description: "Liste les projets Studio (du plus récent au plus ancien) : id, nom, format, nombre de scènes, durée, dernière modification et lien studio_url.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filtre sur le nom (sans casse)." },
        limit: { type: "number", description: "Nombre maximum (1 à 50, défaut 20)." },
      },
    },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const userId = process.env.MCP_USER_ID as string;
      const client = await adminClient();
      const { data, error } = await client
        .from("studio_projects")
        .select("id, name, width, height, data, updated_at")
        .eq("user_id", userId);
      if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
      const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
      const limit = Math.max(1, Math.min(50, Math.trunc(optNumber(input, "limit") ?? 20)));
      const rows = ((data ?? []) as (ProjectRow & { width: number; height: number })[])
        .filter((r) => !search || (r.name ?? "").toLowerCase().includes(search))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, limit);
      return JSON.stringify({
        count: rows.length,
        projects: rows.map((r) => {
          const scenes = Array.isArray((r.data as { scenes?: unknown[] } | null)?.scenes)
            ? ((r.data as { scenes: { duration?: number }[] }).scenes)
            : [];
          return {
            project_id: r.id,
            name: r.name,
            format: formatOf({ width: r.width, height: r.height }),
            scene_count: scenes.length,
            duration: Math.round(scenes.reduce((sum, sc) => sum + (Number(sc.duration) || 0), 0) * 10) / 10,
            updated_at: r.updated_at,
            studio_url: studioUrl(r.id),
          };
        }),
      });
    },
  },
  {
    name: "duplicate_project",
    description: "Duplique un projet complet (scènes, calques, médias, musique, marque) sous un nouveau nom — utile pour décliner une vidéo (autre format, autre langue) sans toucher à l'original.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        name: { type: "string", description: "Nom de la copie (défaut : « <nom> (copie) »)." },
        format: { type: "string", enum: Object.keys(PROJECT_FORMATS), description: "Format de la copie (optionnel)." },
      },
    },
    run: async (input: McpInput) => {
      const { project, userId } = await needProject(input);
      let copy = duplicateProject(project, typeof input.name === "string" && input.name.trim() ? input.name.trim() : undefined);
      if ((Object.keys(PROJECT_FORMATS) as ProjectFormat[]).includes(input.format as ProjectFormat)) {
        copy = setProjectFormat(copy, input.format as ProjectFormat);
      }
      copy = requireValid(copy);
      const client = await adminClient();
      const { error } = await client.from("studio_projects").insert({
        id: copy.id,
        user_id: userId,
        name: copy.name,
        schema_version: copy.schemaVersion,
        fps: copy.fps,
        width: copy.width,
        height: copy.height,
        data: JSON.parse(serializeProject(copy)),
      });
      if (error) throw new McpToolError(mapDbError(error), error.code === "PGRST205" ? hintMigration() : undefined);
      return JSON.stringify({ project_id: copy.id, name: copy.name, format: formatOf(copy), studio_url: studioUrl(copy.id) });
    },
  },
  {
    name: "create_scene",
    description: "Ajoute une scène à la fin d'un projet (nom, durée, fond, transition d'entrée depuis la scène précédente).",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        name: { type: "string" },
        duration: { type: "number" },
        background: { type: "string", description: "#RRGGBB" },
        ...TRANSITION_PROPERTIES,
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
      const scene = makeScene(name, duration, [], { background: isSafeColor(input.background) ? (input.background as string) : undefined });
      const transition = optTransition(input);
      if (transition) scene.transition = transition;
      const next = { ...project, scenes: [...project.scenes, scene] };
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ project_id: projectId, scene_count: next.scenes.length, scenes: next.scenes.map((s) => ({ id: s.id, name: s.name })) });
    },
  },
  {
    name: "add_element",
    description: "Ajoute un élément d'animation (template publié) à une scène, au premier plan. Par défaut timing = fit. Utilisez transparent=true pour superposer le calque à ceux du dessous.",
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
        x: { type: "number" },
        y: { type: "number" },
        scale: { type: "number" },
        ...STYLE_PROPERTIES,
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
      // Couleurs, transparence, vitesse, police : appliquées par applyStyle (valeurs validées).

      // Marque du projet d'abord (couleurs, police, logo), puis les réglages explicites de l'appel.
      const kind = template.meta.elementKind as ElementKind;
      const element = makeElement(template.templateId, kind as never, applyStyle(brandedConfig(config, kind, project.brand), input), {
        timing: optTiming(input) ?? "fit",
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
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, element_id: element.id, scene_index: sceneIdx, total_elements: next.scenes[sceneIdx].elements.length, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "update_element",
    description: "Met à jour un élément : durée, début, position, échelle, libellé, texte, couleurs, transparence, vitesse, police, timing et ordre du calque.",
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
        ...STYLE_PROPERTIES,
        ...MEDIA_PROPERTIES,
        layer: {
          description: "Ordre du calque : 'up', 'down', 'front', 'back' ou index (0 = fond).",
          oneOf: [{ type: "string", enum: ["up", "down", "front", "back"] }, { type: "number" }],
        },
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
        patched.config = applyStyle(patched.config, input);
        if (patched.media) patched.media = applyMediaOptions(patched.media, input);
        const timing = optTiming(input);
        if (timing) patched.timing = timing;
        return patched;
      });
      const layer = input.layer;
      const layered =
        layer === "up" || layer === "down" || layer === "front" || layer === "back" || typeof layer === "number"
          ? moveElementLayer(next, located.scene.id, elementId, layer as number | "up" | "down" | "front" | "back")
          : next;
      const valid = requireValid(layered);
      validateLocated(valid, projectId, located);
      await persistProject(valid, userId, project);
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
      await persistProject(requireValid(next), userId, project);
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
      await persistProject(requireValid(next), userId, project);
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
      // Les logos (data URL de plusieurs centaines de Ko) sont abrégés dans la réponse.
      return JSON.stringify(project, (key, value) =>
        key === "logoUrl" && typeof value === "string" ? `(logo ${Math.round(value.length / 1024)} Ko)` : value
      );
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
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, project_id: projectId, name: next.name, updated_at: new Date().toISOString(), studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "update_scene",
    description: "Modifie une scène (scene_id ou scene_index) : nom, durée (s), couleur de fond sous les calques, transition d'entrée (sans effet sur la 1re scène).",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        scene_id: { type: "string" },
        scene_index: { type: "number" },
        name: { type: "string" },
        duration: { type: "number" },
        background: { type: "string", description: "#RRGGBB" },
        ...TRANSITION_PROPERTIES,
      },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const idx = needScene(input, project);
      const next = updateScene(project, project.scenes[idx].id, {
        name: typeof input.name === "string" ? input.name : undefined,
        duration: optNumber(input, "duration"),
        background: typeof input.background === "string" ? input.background : undefined,
        transition: optTransition(input, project.scenes[idx].transition),
      });
      await persistProject(requireValid(next), userId, project);
      const scene = next.scenes[idx];
      return JSON.stringify({ ok: true, scene: { id: scene.id, name: scene.name, duration: scene.duration, background: scene.background ?? "#000000", transition: scene.transition ?? null }, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "duplicate_scene",
    description: "Duplique une scène (scene_id ou scene_index) avec tous ses calques, juste après l'originale. Renvoie la nouvelle scène et les nouveaux element_id.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        scene_id: { type: "string" },
        scene_index: { type: "number" },
        name: { type: "string", description: "Nom de la copie (optionnel)." },
      },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const idx = needScene(input, project);
      const result = duplicateScene(project, project.scenes[idx].id);
      if (!result) throw new McpToolError("Scène introuvable.");
      let next = result.project;
      if (typeof input.name === "string" && input.name.trim()) next = updateScene(next, result.scene.id, { name: input.name });
      await persistProject(requireValid(next), userId, project);
      const scene = next.scenes[idx + 1];
      return JSON.stringify({
        ok: true,
        scene_index: idx + 1,
        scene: { id: scene.id, name: scene.name, duration: scene.duration },
        elements: scene.elements.map((el) => ({ element_id: el.id, label: el.label, template_key: el.templateKey })),
        studio_url: studioUrl(projectId),
      });
    },
  },
  {
    name: "delete_scene",
    description: "Supprime une scène (scene_id ou scene_index). Le projet garde au moins une scène.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" }, scene_id: { type: "string" }, scene_index: { type: "number" } },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      if (project.scenes.length <= 1) throw new McpToolError("Impossible : le projet doit garder au moins une scène.");
      const idx = needScene(input, project);
      const next = removeScene(project, project.scenes[idx].id);
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, scene_count: next.scenes.length, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "delete_element",
    description: "Supprime un élément (calque) du projet.",
    inputSchema: {
      type: "object",
      required: ["project_id", "element_id"],
      properties: { project_id: { type: "string" }, element_id: { type: "string" } },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const elementId = needString(input, "element_id", "element_id");
      const located = findLocated(project, elementId);
      const next = removeElement(project, located.scene.id, elementId);
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "set_format",
    description: "Change le format de la vidéo : 16:9 (paysage), 9:16 (vertical Reels/TikTok/Shorts) ou 1:1 (carré).",
    inputSchema: {
      type: "object",
      required: ["project_id", "format"],
      properties: { project_id: { type: "string" }, format: { type: "string", enum: Object.keys(PROJECT_FORMATS) } },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const format = input.format as ProjectFormat;
      if (!(format in PROJECT_FORMATS)) throw new McpToolError("format invalide : 16:9, 9:16 ou 1:1.");
      const next = setProjectFormat(project, format);
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, format: formatOf(next), width: next.width, height: next.height, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "set_brand",
    description:
      "Définit le kit de marque du projet (nom, couleurs, police, logo). apply=true l'applique aussi à toutes les scènes (fond) et à tous les éléments (couleurs, police, logo des Logo Reveal ; les calques transparents le restent).",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        name: { type: "string" },
        primary_color: { type: "string" },
        accent_color: { type: "string" },
        background_color: { type: "string" },
        font_family: { type: "string", enum: FONT_IDS },
        logo_url: { type: "string", description: "data:image/(png|jpeg|webp|svg+xml);base64,… (≤ 300 Ko)" },
        apply: { type: "boolean" },
      },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const current = project.brand ?? { primaryColor: "#F5F5F7", accentColor: "#0A84FF", backgroundColor: "#000000" };
      const brand = sanitizeBrand({
        ...current,
        ...(typeof input.name === "string" ? { name: input.name } : {}),
        ...(input.primary_color !== undefined ? { primaryColor: input.primary_color } : {}),
        ...(input.accent_color !== undefined ? { accentColor: input.accent_color } : {}),
        ...(input.background_color !== undefined ? { backgroundColor: input.background_color } : {}),
        ...(input.font_family !== undefined ? { fontFamily: input.font_family } : {}),
        ...(input.logo_url !== undefined ? { logoUrl: input.logo_url } : {}),
      });
      if (!brand) throw new McpToolError("Kit de marque invalide.");
      if (typeof input.logo_url === "string" && !brand.logoUrl) {
        throw new McpToolError("logo_url refusé : data URL image (png, jpeg, webp, svg) en base64, 300 Ko maximum.");
      }
      const next = input.apply === true ? applyBrand(project, brand) : { ...project, brand };
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, brand: { ...brand, logoUrl: brand.logoUrl ? "(défini)" : undefined }, applied: input.apply === true, studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "preview_frame",
    description:
      "Capture une image du projet à un instant donné (secondes depuis le début), telle qu'elle apparaîtra dans la vidéo. Utile pour vérifier une composition avant l'export.",
    inputSchema: {
      type: "object",
      required: ["project_id", "time"],
      properties: {
        project_id: { type: "string" },
        time: { type: "number", description: "Instant en secondes (0 = début)." },
        width: { type: "number", description: "Largeur de l'image en pixels (320 à 1920, défaut 960)." },
      },
    },
    run: async (input: McpInput): Promise<McpToolOutput> => {
      const { projectId } = await needProject(input);
      const { previewFrame } = await import("@/lib/render/engine");
      const time = optNumber(input, "time") ?? 0;
      const width = Math.max(320, Math.min(1920, optNumber(input, "width") ?? 960));
      const jpeg = await previewFrame(projectId, time, width);
      return {
        content: [
          { type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" },
          { type: "text", text: JSON.stringify({ project_id: projectId, time, width }) },
        ],
      };
    },
  },
  {
    name: "render_project",
    description:
      "Lance l'export MP4 (H.264, 30 i/s, 1920×1080 / 1080×1920 / 1080×1080 selon le format). Asynchrone : renvoie render_id, à suivre avec get_render (environ 3 à 6 s de calcul par seconde de vidéo).",
    inputSchema: { type: "object", required: ["project_id"], properties: { project_id: { type: "string" } } },
    run: async (input: McpInput) => {
      const { projectId, project } = await needProject(input);
      const { startRender } = await import("@/lib/render/engine");
      const job = await startRender(projectId);
      return JSON.stringify({ render_id: job.id, status: job.status, frames: job.frames, format: formatOf(project), hint: "Appelez get_render avec render_id jusqu'à status = done." });
    },
  },
  {
    name: "get_render",
    description: "État d'un export MP4 : pending, running (progress en %), done (url de téléchargement signée, valable 7 jours) ou error.",
    inputSchema: { type: "object", required: ["render_id"], properties: { render_id: { type: "string" } } },
    run: async (input: McpInput) => {
      const conf = mcpConfigCheck();
      if (!conf.ok) throw new McpToolError(conf.reason);
      const { getRender } = await import("@/lib/render/engine");
      const job = await getRender(needString(input, "render_id", "render_id"));
      if (!job || job.userId !== process.env.MCP_USER_ID) throw new McpToolError("Rendu introuvable.");
      return JSON.stringify({
        render_id: job.id,
        project_id: job.projectId,
        status: job.status,
        progress: Math.round(job.progress * 100),
        url: job.url ?? null,
        size_mb: job.sizeBytes ? Math.round((job.sizeBytes / 1048576) * 10) / 10 : null,
        stored: job.storagePath ? "supabase-storage" : job.url ? "serveur (temporaire)" : null,
        storage_error: job.storageError ?? null,
        error: job.error ?? null,
      });
    },
  },
  {
    name: "list_media",
    description: "Liste les médias importés dans le projet (images, vidéos, audio) avec leurs dimensions et durées.",
    inputSchema: { type: "object", required: ["project_id"], properties: { project_id: { type: "string" } } },
    run: async (input: McpInput) => {
      const { project } = await needProject(input);
      return JSON.stringify({
        media: project.media.map(assetSummary),
        audio: project.audio ? { ...project.audio } : null,
      });
    },
  },
  {
    name: "import_media_url",
    description: "Importe une image, une vidéo (convertie en MP4, 2 min max) ou un fichier audio depuis une URL publique http(s), dans la bibliothèque du projet.",
    inputSchema: {
      type: "object",
      required: ["project_id", "url"],
      properties: { project_id: { type: "string" }, url: { type: "string" }, name: { type: "string" } },
    },
    run: async (input: McpInput) => {
      const url = typeof input.url === "string" ? input.url : "";
      const { importFromUrl } = await import("@/lib/media/server");
      return storeAsset(input, (userId, projectId) =>
        importFromUrl({ userId, projectId, url, name: typeof input.name === "string" ? input.name : undefined })
      );
    },
  },
  {
    name: "capture_screenshot",
    description: "Capture d'écran d'une page web publique (ex. la page d'accueil ou le tableau de bord public d'une app SaaS ; une ancre #section fait défiler jusqu'à la section), rangée comme image dans le projet. Bandeaux cookies et bulles de chat masqués par défaut. Idéal avec add_media_element frame=browser (ou phone avec width=390, height=844).",
    inputSchema: {
      type: "object",
      required: ["project_id", "url"],
      properties: {
        project_id: { type: "string" },
        url: { type: "string" },
        width: { type: "number", description: "Largeur de la fenêtre (320 à 2560, défaut 1440)." },
        height: { type: "number", description: "Hauteur de la fenêtre (320 à 2560, défaut 900)." },
        full_page: { type: "boolean", description: "true = page entière (défilement compris)." },
        clean: { type: "boolean", description: "Masquer les bandeaux cookies et les bulles de chat (défaut true ; rien n'est cliqué ni accepté)." },
        name: { type: "string" },
      },
    },
    run: async (input: McpInput) => {
      const url = typeof input.url === "string" ? input.url : "";
      const { captureScreenshot } = await import("@/lib/media/server");
      return storeAsset(input, (userId, projectId) =>
        captureScreenshot({
          userId,
          projectId,
          url,
          width: optNumber(input, "width"),
          height: optNumber(input, "height"),
          fullPage: input.full_page === true,
          clean: input.clean !== false,
          name: typeof input.name === "string" ? input.name : undefined,
        })
      );
    },
  },
  {
    name: "add_media_element",
    description: "Place une image ou une vidéo de la bibliothèque dans une scène, avec habillage (navigateur, téléphone), mouvement lent et entrée. Par défaut au-dessus des autres médias mais sous les animations (layer = back), qui restent lisibles par-dessus.",
    inputSchema: {
      type: "object",
      required: ["project_id", "asset_id"],
      properties: {
        project_id: { type: "string" },
        asset_id: { type: "string" },
        scene_index: { type: "number" },
        start: { type: "number" },
        duration: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        scale: { type: "number" },
        timing: STYLE_PROPERTIES.timing,
        layer: { type: "string", enum: ["back", "front"], description: "back (défaut) = au-dessus des médias, sous les animations ; front = tout au premier plan." },
        ...MEDIA_PROPERTIES,
      },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      const assetId = needString(input, "asset_id", "asset_id");
      const asset = project.media.find((m) => m.id === assetId);
      if (!asset) throw new McpToolError(`Média introuvable dans le projet : ${assetId} (voir list_media).`);
      if (asset.kind === "audio") throw new McpToolError("C'est un fichier audio : utilisez set_audio.");
      const sceneIdx = needIndex(input, project);
      const scene = project.scenes[sceneIdx];
      const base = makeMediaElement(asset, {
        start: optNumber(input, "start") ?? 0,
        duration: optNumber(input, "duration") ?? scene.duration,
        x: optNumber(input, "x"),
        y: optNumber(input, "y"),
        scale: optNumber(input, "scale"),
        timing: optTiming(input),
        frame: asset.kind === "image" ? "browser" : "none",
      });
      const element = { ...base, media: applyMediaOptions(base.media!, input) };
      const front = input.layer === "front";
      const next = insertMediaElement(project, scene.id, element, front);
      await persistProject(requireValid(next), userId, project);
      return JSON.stringify({ ok: true, element_id: element.id, scene_index: sceneIdx, layer: front ? "front" : "back", studio_url: studioUrl(projectId) });
    },
  },
  {
    name: "set_audio",
    description: "Définit la musique de la vidéo (fichier audio de la bibliothèque) : volume 0-1, début dans la vidéo, décalage dans le fichier, fondus. asset_id = null retire la musique.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        asset_id: { type: ["string", "null"] },
        volume: { type: "number" },
        start: { type: "number", description: "Début de la musique dans la vidéo (s)." },
        trim_start: { type: "number", description: "Instant de départ dans le fichier audio (s)." },
        fade_in: { type: "number" },
        fade_out: { type: "number" },
      },
    },
    run: async (input: McpInput) => {
      const { project, projectId, userId } = await needProject(input);
      if (input.asset_id === null) {
        await persistProject(requireValid(setProjectAudio(project, null)), userId, project);
        return JSON.stringify({ ok: true, audio: null });
      }
      const assetId = typeof input.asset_id === "string" ? input.asset_id : project.audio?.assetId;
      const asset = project.media.find((m) => m.id === assetId && m.kind === "audio");
      if (!asset) throw new McpToolError("Fichier audio introuvable dans le projet (voir list_media).");
      const current = project.audio?.assetId === asset.id ? project.audio : undefined;
      const audio = sanitizeAudio({
        volume: 0.8, start: 0, trimStart: 0, fadeIn: 0.5, fadeOut: 1.5,
        ...current,
        assetId: asset.id,
        ...(input.volume !== undefined ? { volume: input.volume } : {}),
        ...(input.start !== undefined ? { start: input.start } : {}),
        ...(input.trim_start !== undefined ? { trimStart: input.trim_start } : {}),
        ...(input.fade_in !== undefined ? { fadeIn: input.fade_in } : {}),
        ...(input.fade_out !== undefined ? { fadeOut: input.fade_out } : {}),
      });
      if (!audio) throw new McpToolError("Réglages audio invalides.");
      await persistProject(requireValid(setProjectAudio(project, audio)), userId, project);
      return JSON.stringify({ ok: true, audio, studio_url: studioUrl(projectId) });
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