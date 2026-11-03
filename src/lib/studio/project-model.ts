import { isComponentKey } from "@/lib/animations/registry";
import { getStudioTemplate, isStudioTemplateKey, underlyingComponentKeyOf } from "@/lib/studio/template-registry";
import { isSafeColor, isSafeLogoUrl, sanitizeConfig } from "@/lib/animations/config";
import { isBrandFont } from "@/lib/brand/fonts";
import type { AnimationConfig } from "@/types/animation";

/* ------------------------------------------------------------------ */

export interface LocatedElement {
  element: StudioElement;
  scene: StudioScene;
  sceneId: string;
  sceneIndex: number;
  /** Temps global au début de l'élément. */
  globalStart: number;
}

/** Localise un élément et renvoie son contexte timeline. */
export function findElement(
  project: StudioProject,
  elementId: string,
  sceneId?: string
): LocatedElement | null {
  const offsets = sceneOffsets(project);
  for (let i = 0; i < project.scenes.length; i += 1) {
    const scene = project.scenes[i];
    if (sceneId && scene.id !== sceneId) continue;
    const element = scene.elements.find((el) => el.id === elementId);
    if (element) {
      return {
        element,
        scene,
        sceneId: scene.id,
        sceneIndex: i,
        globalStart: offsets[i] + element.start,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Décales temporels                                                   */
/* ------------------------------------------------------------------ */

/**
 * Modèle de projet MotionGraphic Studio — versionné, sérialisable en JSON
 * (localStorage aujourd'hui, Supabase en Phase 3) et validé à chaque
 * ouverture. Jamais de code exécutable : uniquement des données structurées.
 *
 * Horizon temporel : temps global continu. Les scènes sont séquentielles ;
 * leurs éléments sont positionnés en secondes relatives au début de scène.
 * Frame-accurate : toutes les durées/positions sont arrondies au 1/30 s.
 */

export const PROJECT_SCHEMA_VERSION = 1;
export const STUDIO_FPS = 30;
export const FRAME_SECONDS = 1 / STUDIO_FPS;

export type ElementKind = "text" | "shape" | "cards" | "logo" | "media";

/** Clé de « template » des éléments média (image/vidéo importée) : pas d'animation GSAP. */
export const MEDIA_TEMPLATE_KEY = "media";

/* ------------------------------------------------------------------ */
/* Médias (images, vidéos, audio) importés dans le projet               */
/* ------------------------------------------------------------------ */

export type MediaKind = "image" | "video" | "audio";

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  /** Chemin dans le bucket privé « studio-media » (jamais une URL publique). */
  storagePath: string;
  mime: string;
  width?: number;
  height?: number;
  /** Durée en secondes (vidéo, audio). */
  duration?: number;
  sizeBytes?: number;
  createdAt: string;
}

/** Réglages d'un élément média (image ou vidéo) dans une scène. */
export interface MediaOptions {
  assetId: string;
  /** cover = remplit le cadre, contain = image entière. */
  fit: "cover" | "contain";
  /** Habillage : aucun, fenêtre de navigateur ou téléphone. */
  frame: "none" | "browser" | "phone";
  /** Mouvement lent pendant l'élément (effet « Ken Burns »). */
  motion: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  /** Entrée / sortie. */
  enter: "none" | "fade" | "rise" | "scale";
  /** Vidéo : décalage de lecture dans le fichier (s). */
  trimStart: number;
}

export const MEDIA_FITS: MediaOptions["fit"][] = ["cover", "contain"];
export const MEDIA_FRAMES: MediaOptions["frame"][] = ["none", "browser", "phone"];
export const MEDIA_MOTIONS: MediaOptions["motion"][] = ["none", "zoom-in", "zoom-out", "pan-left", "pan-right"];
export const MEDIA_ENTERS: MediaOptions["enter"][] = ["none", "fade", "rise", "scale"];

/** Piste musicale du projet. */
export interface ProjectAudio {
  assetId: string;
  /** Volume 0..1. */
  volume: number;
  /** Début de la musique dans la vidéo (s). */
  start: number;
  /** Décalage de lecture dans le fichier audio (s). */
  trimStart: number;
  fadeIn: number;
  fadeOut: number;
}

export interface StudioElement {
  id: string;
  label: string;
  kind: ElementKind;
  templateKey: string;
  /** Position en secondes depuis le début de la scène. */
  start: number;
  /** Durée en secondes dans la timeline. */
  duration: number;
  /** Paramètres d'animation (schéma partagé : /types/animation). */
  config: AnimationConfig;
  /** Position/taille dans le cadre 16:9 (pourcentages). */
  x: number; // 0-100 (% du centre)
  y: number;
  scale: number; // 0.1-3
  /** Élément média (kind = "media") : image/vidéo importée et son habillage. */
  media?: MediaOptions;
  /**
   * Adaptation de l'animation à la durée de l'élément :
   * - "natural" (défaut historique) : l'animation joue à sa vitesse, coupée à la fin ;
   * - "fit" : entrée, maintien jusqu'à la fin, puis sortie qui se termine pile à la fin ;
   * - "hold" : entrée puis maintien figé (pas de sortie) — idéal en fin de vidéo.
   */
  timing?: ElementTiming;
}

export type ElementTiming = "natural" | "fit" | "hold";
export const ELEMENT_TIMINGS: ElementTiming[] = ["natural", "fit", "hold"];

/** Formats de sortie proposés (pixels du rendu final). */
export const PROJECT_FORMATS = {
  "16:9": { width: 1920, height: 1080, label: "Paysage 16:9" },
  "9:16": { width: 1080, height: 1920, label: "Vertical 9:16" },
  "1:1": { width: 1080, height: 1080, label: "Carré 1:1" },
} as const;
export type ProjectFormat = keyof typeof PROJECT_FORMATS;

export function formatOf(project: Pick<StudioProject, "width" | "height">): ProjectFormat {
  if (project.height > project.width) return "9:16";
  if (project.height === project.width) return "1:1";
  return "16:9";
}

/** Kit de marque du projet (appliqué aux éléments via applyBrand). */
export interface BrandKit {
  name?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily?: string;
  logoUrl?: string;
}

export interface StudioScene {
  id: string;
  name: string;
  duration: number;
  /** Fond de la scène, sous tous les calques (défaut #000000). */
  background?: string;
  /** Calques : le premier est au fond, le dernier au premier plan. */
  elements: StudioElement[];
  /** Transition d'entrée depuis la scène précédente (ignorée pour la 1re scène). */
  transition?: SceneTransition;
}

export type SceneTransitionType = "none" | "fade" | "slide-left" | "slide-up" | "wipe" | "zoom";
export interface SceneTransition {
  type: SceneTransitionType;
  /** Durée en secondes (0,2 à 2, limitée à la moitié de la scène). */
  duration: number;
}
export const SCENE_TRANSITIONS: SceneTransitionType[] = ["none", "fade", "slide-left", "slide-up", "wipe", "zoom"];

export function sanitizeTransition(input: unknown): SceneTransition | null {
  if (typeof input !== "object" || input === null) return null;
  const t = input as Record<string, unknown>;
  if (!SCENE_TRANSITIONS.includes(t.type as SceneTransitionType) || t.type === "none") return null;
  const d = Number(t.duration);
  return { type: t.type as SceneTransitionType, duration: roundToFrame(Number.isFinite(d) ? clampNumber(d, 0.2, 2) : 0.6) };
}

/** Durée effective de la transition d'entrée de la scène `index` (0 si aucune). */
export function transitionDurationOf(project: StudioProject, index: number): number {
  const scene = project.scenes[index];
  if (index === 0 || !scene?.transition) return 0;
  return Math.min(scene.transition.duration, scene.duration / 2);
}

export interface StudioProject {
  /** Identifiant stable du projet (uuid v4 local ou côté base en Phase 3). */
  id: string;
  schemaVersion: number;
  name: string;
  fps: number;
  width: number;
  height: number;
  scenes: StudioScene[];
  /** Kit de marque (couleurs, police, logo) — optionnel. */
  brand?: BrandKit;
  /** Bibliothèque de médias importés (images, vidéos, audio) du projet. */
  media: MediaAsset[];
  /** Musique de la vidéo (optionnelle). */
  audio?: ProjectAudio;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Fabriques                                                           */
/* ------------------------------------------------------------------ */

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function roundToFrame(seconds: number): number {
  return Math.round(seconds / FRAME_SECONDS) * FRAME_SECONDS;
}

export function clampNumber(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

export function makeElement(
  templateKey: string,
  kind: ElementKind,
  config: AnimationConfig,
  opts: { start?: number; duration?: number; x?: number; y?: number; scale?: number; label?: string; id?: string; timing?: ElementTiming } = {}
): StudioElement {
  return {
    ...(opts.timing ? { timing: opts.timing } : {}),
    id: opts.id ?? uid(),
    label: opts.label ?? (config.text.slice(0, 24) || templateKey),
    kind,
    templateKey,
    start: roundToFrame(clampNumber(opts.start ?? 0, 0, 600)),
    duration: roundToFrame(clampNumber(opts.duration ?? config.duration, 1, 120)),
    config: { ...config },
    x: clampNumber(opts.x ?? 50, 0, 100),
    y: clampNumber(opts.y ?? 50, 0, 100),
    scale: clampNumber(opts.scale ?? 1, 0.2, 3),
  };
}

export function makeScene(
  name: string,
  duration = 5,
  elements: StudioElement[] = [],
  opts: { id?: string; background?: string } = {}
): StudioScene {
  return {
    id: opts.id ?? uid(),
    name,
    ...(opts.background ? { background: opts.background } : {}),
    duration: roundToFrame(clampNumber(duration, 1, 600)),
    elements,
  };
}

export function makeDefaultProject(
  name = "Nouveau projet SaaS",
  opts: { deterministic?: boolean; format?: ProjectFormat } = {}
): StudioProject {
  const dims = PROJECT_FORMATS[opts.format ?? "16:9"];
  // Mode déterministe : ids/dates figés -> rendu serveur STRICTEMENT identique
  // au premier rendu client (zéro erreur d'hydratation sur /studio).
  const det = opts.deterministic ?? false;
  const idOf = det ? (fixed: string) => fixed : () => uid();
  const now = det ? "1970-01-01T00:00:00.000Z" : new Date().toISOString();
  return {
    id: idOf("project-default"),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    fps: STUDIO_FPS,
    width: dims.width,
    height: dims.height,
    scenes: [
      makeScene("Intro", 5, [
        makeElement("kinetic-type-01", "text", {
          text: "Votre SaaS",
          primaryColor: "#F5F5F7",
          accentColor: "#64D2FF",
          backgroundColor: "#000000",
          duration: 3.2,
          speed: 1,
        }, { duration: 5, label: "Titre", id: idOf("element-intro-title"), timing: "fit" }),
      ], { id: idOf("scene-intro") }),
      makeScene("Démo produit", 6, [
        makeElement("staggered-cards-01", "cards", {
          text: "UI MOTION",
          primaryColor: "#E7E7EF",
          accentColor: "#0A84FF",
          backgroundColor: "#000000",
          duration: 4.2,
          speed: 1,
        }, { duration: 6, label: "Cards UI", id: idOf("element-demo-cards"), timing: "fit" }),
      ], { id: idOf("scene-demo") }),
    ],
    media: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Décales temporels                                                   */
/* ------------------------------------------------------------------ */

export function sceneOffsets(project: StudioProject): number[] {
  let offset = 0;
  return project.scenes.map((scene) => {
    const start = offset;
    offset += scene.duration;
    return start;
  });
}

export function projectDuration(project: StudioProject): number {
  return project.scenes.reduce((acc, scene) => acc + scene.duration, 0);
}

/** Renvoie l'index de scène active à un temps global donné. */
export function sceneIndexAtTime(project: StudioProject, time: number): number {
  const offsets = sceneOffsets(project);
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (time >= offsets[i]) return i;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Validation (ouverture de projet : JSON externe, localStorage, MCP)  */
/* ------------------------------------------------------------------ */

interface ValidationError extends Error {
  code?: string;
}

export function validateProject(input: unknown): StudioProject | null {
  try {
    if (typeof input !== "object" || input === null) return null;
    const raw = input as Record<string, unknown>;
    if (raw.schemaVersion !== PROJECT_SCHEMA_VERSION) return null;
    if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) return null;

    const scenes: StudioScene[] = [];
    for (const sceneRaw of raw.scenes as unknown[]) {
      const s = (typeof sceneRaw === "object" && sceneRaw !== null ? sceneRaw : {}) as Record<string, unknown>;
      if (typeof s.id !== "string") return null;
      const sceneDuration = clampNumber(Number(s.duration), 1, 600);
      const elements: StudioElement[] = [];
      for (const elRaw of (Array.isArray(s.elements) ? s.elements : []) as unknown[]) {
        const e = (typeof elRaw === "object" && elRaw !== null ? elRaw : {}) as Record<string, unknown>;
        if (typeof e.id !== "string") return null;
        const kind = e.kind as ElementKind;
        const isMedia = kind === "media";
        if (isMedia) {
          if (e.templateKey !== MEDIA_TEMPLATE_KEY) return null;
        } else if (typeof e.templateKey !== "string" || !(isComponentKey(e.templateKey) || isStudioTemplateKey(e.templateKey))) {
          return null;
        }
        if (kind !== "text" && kind !== "shape" && kind !== "cards" && kind !== "logo" && kind !== "media") return null;
        const media = isMedia ? sanitizeMediaOptions(e.media) : null;
        if (isMedia && !media) return null;
        elements.push({
          id: e.id,
          label: typeof e.label === "string" ? e.label.slice(0, 60) : e.templateKey,
          kind,
          templateKey: e.templateKey,
          start: roundToFrame(clampNumber(Number(e.start), 0, 600)),
          duration: roundToFrame(clampNumber(Number(e.duration), 1, 120)),
          config: sanitizeConfig(e.config, makeDefaultConfig()),
          x: clampNumber(Number(e.x), 0, 100),
          y: clampNumber(Number(e.y), 0, 100),
          scale: clampNumber(Number(e.scale), 0.2, 3),
          ...(ELEMENT_TIMINGS.includes(e.timing as ElementTiming) ? { timing: e.timing as ElementTiming } : {}),
          ...(media ? { media } : {}),
        });
      }
      scenes.push({
        id: s.id,
        name: typeof s.name === "string" ? s.name.slice(0, 80) : "Scène",
        duration: sceneDuration,
        ...(isSafeColor(s.background) ? { background: s.background as string } : {}),
        elements,
        ...(sanitizeTransition(s.transition) ? { transition: sanitizeTransition(s.transition) as SceneTransition } : {}),
      });
    }

    return {
      id: typeof raw.id === "string" ? raw.id.slice(0, 64) : uid(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: typeof raw.name === "string" ? raw.name.slice(0, 120) : "Projet Studio",
      fps: STUDIO_FPS,
      ...snapFormat(Number(raw.width), Number(raw.height)),
      scenes,
      ...(sanitizeBrand(raw.brand) ? { brand: sanitizeBrand(raw.brand) as BrandKit } : {}),
      media: sanitizeMediaList(raw.media),
      ...(sanitizeAudio(raw.audio) ? { audio: sanitizeAudio(raw.audio) as ProjectAudio } : {}),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    const validationError: ValidationError | null =
      error instanceof Error ? error : null;
    void validationError;
    return null;
  }
}

const MEDIA_PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){1,6}$/;
const MEDIA_MIME_RE = /^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|webm)|audio\/(mpeg|mp4|aac|wav|x-wav|ogg|webm))$/;

function finiteOr(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function sanitizeMediaAsset(input: unknown): MediaAsset | null {
  if (typeof input !== "object" || input === null) return null;
  const a = input as Record<string, unknown>;
  if (typeof a.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(a.id)) return null;
  if (a.kind !== "image" && a.kind !== "video" && a.kind !== "audio") return null;
  if (typeof a.storagePath !== "string" || !MEDIA_PATH_RE.test(a.storagePath) || a.storagePath.includes("..")) return null;
  if (typeof a.mime !== "string" || !MEDIA_MIME_RE.test(a.mime)) return null;
  return {
    id: a.id,
    kind: a.kind,
    name: typeof a.name === "string" ? a.name.slice(0, 120) : a.kind,
    storagePath: a.storagePath,
    mime: a.mime,
    ...(a.width !== undefined ? { width: Math.round(finiteOr(a.width, 0, 0, 10000)) } : {}),
    ...(a.height !== undefined ? { height: Math.round(finiteOr(a.height, 0, 0, 10000)) } : {}),
    ...(a.duration !== undefined ? { duration: finiteOr(a.duration, 0, 0, 3600) } : {}),
    ...(a.sizeBytes !== undefined ? { sizeBytes: Math.round(finiteOr(a.sizeBytes, 0, 0, 5e9)) } : {}),
    createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString(),
  };
}

function sanitizeMediaList(input: unknown): MediaAsset[] {
  if (!Array.isArray(input)) return [];
  return input.map(sanitizeMediaAsset).filter((a): a is MediaAsset => a !== null).slice(0, 200);
}

export function sanitizeMediaOptions(input: unknown): MediaOptions | null {
  if (typeof input !== "object" || input === null) return null;
  const m = input as Record<string, unknown>;
  if (typeof m.assetId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(m.assetId)) return null;
  const pick = <T extends string>(v: unknown, list: T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
  return {
    assetId: m.assetId,
    fit: pick(m.fit, MEDIA_FITS, "cover"),
    frame: pick(m.frame, MEDIA_FRAMES, "none"),
    motion: pick(m.motion, MEDIA_MOTIONS, "none"),
    enter: pick(m.enter, MEDIA_ENTERS, "fade"),
    trimStart: finiteOr(m.trimStart, 0, 0, 3600),
  };
}

export function sanitizeAudio(input: unknown): ProjectAudio | null {
  if (typeof input !== "object" || input === null) return null;
  const a = input as Record<string, unknown>;
  if (typeof a.assetId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(a.assetId)) return null;
  return {
    assetId: a.assetId,
    volume: finiteOr(a.volume, 0.8, 0, 1),
    start: finiteOr(a.start, 0, 0, 600),
    trimStart: finiteOr(a.trimStart, 0, 0, 3600),
    fadeIn: finiteOr(a.fadeIn, 0.5, 0, 10),
    fadeOut: finiteOr(a.fadeOut, 1.5, 0, 10),
  };
}

/** Crée un élément média (image/vidéo) au premier plan d'une scène. */
export function makeMediaElement(
  asset: MediaAsset,
  opts: Partial<MediaOptions> & { start?: number; duration?: number; x?: number; y?: number; scale?: number; label?: string; timing?: ElementTiming } = {}
): StudioElement {
  const media = sanitizeMediaOptions({ fit: "cover", frame: "none", motion: "none", enter: "fade", trimStart: 0, ...opts, assetId: asset.id }) as MediaOptions;
  const defaultDuration = asset.kind === "video" && asset.duration ? Math.min(asset.duration - media.trimStart, 20) : 4;
  return {
    ...makeElement(MEDIA_TEMPLATE_KEY, "media", { text: "", primaryColor: "#FFFFFF", accentColor: "#0A84FF", backgroundColor: "transparent", duration: 4, speed: 1 }, {
      start: opts.start,
      duration: opts.duration ?? Math.max(1, defaultDuration),
      x: opts.x,
      y: opts.y,
      scale: opts.scale,
      label: opts.label ?? asset.name.slice(0, 60),
      timing: opts.timing ?? "fit",
    }),
    media,
  };
}

/**
 * Insère un élément média au-dessus des médias déjà présents dans la scène,
 * mais sous les animations (titres, cartes…) qui restent lisibles par-dessus.
 */
export function insertMediaElement(project: StudioProject, sceneId: string, element: StudioElement, front = false): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const elements = [...scene.elements];
      let index = elements.length;
      if (!front) {
        let lastMedia = -1;
        elements.forEach((el, i) => {
          if (el.kind === "media") lastMedia = i;
        });
        index = lastMedia + 1;
      }
      elements.splice(index, 0, element);
      return { ...scene, elements };
    }),
  };
}

/** Ajoute un média à la bibliothèque du projet. */
export function addMediaAsset(project: StudioProject, asset: MediaAsset): StudioProject {
  return { ...project, updatedAt: new Date().toISOString(), media: [...project.media.filter((m) => m.id !== asset.id), asset] };
}

/** Définit (ou retire avec null) la musique du projet. */
export function setProjectAudio(project: StudioProject, audio: ProjectAudio | null): StudioProject {
  const next: StudioProject = { ...project, updatedAt: new Date().toISOString() };
  if (audio) next.audio = audio;
  else delete next.audio;
  return next;
}

/** Ramène des dimensions quelconques au format proposé le plus proche. */
function snapFormat(width: number, height: number): { width: number; height: number } {
  const w = Number.isFinite(width) && width > 0 ? width : 1920;
  const h = Number.isFinite(height) && height > 0 ? height : 1080;
  const { width: fw, height: fh } = PROJECT_FORMATS[formatOf({ width: w, height: h })];
  return { width: fw, height: fh };
}

export function sanitizeBrand(input: unknown): BrandKit | null {
  if (typeof input !== "object" || input === null) return null;
  const b = input as Record<string, unknown>;
  return {
    ...(typeof b.name === "string" && b.name.trim() ? { name: b.name.trim().slice(0, 60) } : {}),
    primaryColor: isSafeColor(b.primaryColor) ? (b.primaryColor as string) : "#F5F5F7",
    accentColor: isSafeColor(b.accentColor) ? (b.accentColor as string) : "#0A84FF",
    backgroundColor: isSafeColor(b.backgroundColor) ? (b.backgroundColor as string) : "#000000",
    ...(isBrandFont(b.fontFamily) ? { fontFamily: b.fontFamily as string } : {}),
    ...(isSafeLogoUrl(b.logoUrl) ? { logoUrl: b.logoUrl as string } : {}),
  };
}

function makeDefaultConfig(): AnimationConfig {
  return {
    text: "MOTION",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 4,
    speed: 1,
  };
}

/* ------------------------------------------------------------------ */
/* Mutations immuables                                                 */
/* ------------------------------------------------------------------ */

/** Met à jour un élément dans une scène (immuable, retournant un nouveau projet). */
export function updateElement(
  project: StudioProject,
  sceneId: string,
  elementId: string,
  patch: (element: StudioElement) => StudioElement
): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) =>
      scene.id !== sceneId
        ? scene
        : {
            ...scene,
            elements: scene.elements.map((el) => (el.id !== elementId ? el : patch(el))),
          }
    ),
  };
}

/**
 * Remplacement instantané de l'animation d'un élément :
 * - conforme uniquement si le template est compatible avec le type de
 *   l'élément (`compatibleKeysForKind`, registre Studio) ;
 * - conserve texte, couleurs, position, durée, timing, identifiant
 *   (sélection + historique intacts) ;
 * - applique les valeurs par défaut pour les paramètres du nouveau
 *   template qui n'ont pas d'équivalent (schéma config partagé).
 */
export function replaceElementTemplate(
  project: StudioProject,
  sceneId: string,
  elementId: string,
  newTemplateKey: string
): StudioProject | null {
  if (!(isComponentKey(newTemplateKey) || isStudioTemplateKey(newTemplateKey))) return null;
  const source = findElement(project, elementId);
  if (!source || source.sceneId !== sceneId) return null;
  if (getStudioTemplate(newTemplateKey)?.elementKind !== source.element.kind) return null;

  return updateElement(project, sceneId, elementId, (element) => ({
    ...element,
    templateKey: newTemplateKey,
  }));
}

/** Le composant de base d'une clé (builder/frame) du moteur. */
export function baseEngineKeyOf(templateKey: string): string {
  const underlying = underlyingComponentKeyOf(templateKey);
  return underlying ?? templateKey;
}

const isStudioTemplateKeyExport = isStudioTemplateKey;
export { isStudioTemplateKeyExport as isStudioTemplateKeyFromRegistry };
void isStudioTemplateKeyExport;

/** Ajoute un élément d'animation à une scène. */
export function appendElement(
  project: StudioProject,
  sceneId: string,
  element: StudioElement
): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, elements: [...scene.elements, element] } : scene
    ),
  };
}

/** Supprime un élément. */
export function removeElement(project: StudioProject, sceneId: string, elementId: string): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, elements: scene.elements.filter((el) => el.id !== elementId) } : scene
    ),
  };
}

/** Met à jour une scène (nom, durée, fond). */
export function updateScene(
  project: StudioProject,
  sceneId: string,
  patch: Partial<Pick<StudioScene, "name" | "duration" | "background">> & { transition?: SceneTransition | null }
): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const next = { ...scene };
      if (typeof patch.name === "string") next.name = patch.name.slice(0, 80) || scene.name;
      if (typeof patch.duration === "number") next.duration = roundToFrame(clampNumber(patch.duration, 1, 600));
      if (patch.background !== undefined) {
        if (isSafeColor(patch.background)) next.background = patch.background;
      }
      if (patch.transition !== undefined) {
        const t = sanitizeTransition(patch.transition);
        if (t) next.transition = t;
        else delete next.transition;
      }
      return next;
    }),
  };
}

/** Supprime une scène (au moins une scène est conservée). */
export function removeScene(project: StudioProject, sceneId: string): StudioProject {
  if (project.scenes.length <= 1) return project;
  return { ...project, updatedAt: new Date().toISOString(), scenes: project.scenes.filter((s) => s.id !== sceneId) };
}

/** Déplace un calque dans sa scène : index cible (0 = fond) ou "up"/"down". */
export function moveElementLayer(
  project: StudioProject,
  sceneId: string,
  elementId: string,
  target: number | "up" | "down" | "front" | "back"
): StudioProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const from = scene.elements.findIndex((el) => el.id === elementId);
      if (from < 0) return scene;
      const last = scene.elements.length - 1;
      const to =
        target === "up" ? Math.min(last, from + 1)
        : target === "down" ? Math.max(0, from - 1)
        : target === "front" ? last
        : target === "back" ? 0
        : Math.max(0, Math.min(last, Math.round(target)));
      if (to === from) return scene;
      const elements = [...scene.elements];
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return { ...scene, elements };
    }),
  };
}

/** Change le format (16:9, 9:16, 1:1). */
export function setProjectFormat(project: StudioProject, format: ProjectFormat): StudioProject {
  const dims = PROJECT_FORMATS[format];
  return { ...project, updatedAt: new Date().toISOString(), width: dims.width, height: dims.height };
}

/** Config d'un nouvel élément aux couleurs/police/logo de la marque du projet. */
export function brandedConfig(config: AnimationConfig, kind: ElementKind, brand: BrandKit | undefined): AnimationConfig {
  if (!brand) return config;
  return {
    ...config,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    backgroundColor: config.backgroundColor === "transparent" ? "transparent" : brand.backgroundColor,
    ...(brand.fontFamily ? { fontFamily: brand.fontFamily } : {}),
    ...(kind === "logo" && brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
  };
}

/**
 * Applique le kit de marque à tout le projet : couleurs/police/logo de chaque
 * élément ; fonds des scènes. Les éléments à fond transparent le restent.
 */
export function applyBrand(project: StudioProject, brand: BrandKit): StudioProject {
  return {
    ...project,
    brand,
    updatedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      background: brand.backgroundColor,
      elements: scene.elements.map((el) => ({
        ...el,
        config: {
          ...el.config,
          primaryColor: brand.primaryColor,
          accentColor: brand.accentColor,
          backgroundColor: el.config.backgroundColor === "transparent" ? "transparent" : brand.backgroundColor,
          ...(brand.fontFamily ? { fontFamily: brand.fontFamily } : {}),
          ...(el.kind === "logo" && brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
        },
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Sérialisation                                                       */
/* ------------------------------------------------------------------ */

export function serializeProject(project: StudioProject): string {
  return JSON.stringify(project, null, 0);
}

export function deserializeProject(json: string | null): StudioProject | null {
  if (!json) return null;
  try {
    return validateProject(JSON.parse(json));
  } catch {
    return null;
  }
}
/** Nouveaux identifiants pour une scène copiée (scène + calques). */
function cloneScene(scene: StudioScene, name?: string): StudioScene {
  const copy = JSON.parse(JSON.stringify(scene)) as StudioScene;
  copy.id = uid();
  copy.name = (name ?? `${scene.name} (copie)`).slice(0, 80);
  copy.elements = copy.elements.map((el) => ({ ...el, id: uid() }));
  return copy;
}

/** Duplique une scène juste après l'originale. */
export function duplicateScene(project: StudioProject, sceneId: string): { project: StudioProject; scene: StudioScene } | null {
  const index = project.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) return null;
  const scene = cloneScene(project.scenes[index]);
  const scenes = [...project.scenes];
  scenes.splice(index + 1, 0, scene);
  return { project: { ...project, updatedAt: new Date().toISOString(), scenes }, scene };
}

/** Duplique un calque dans sa scène, juste au-dessus de l'original. */
export function duplicateElement(project: StudioProject, sceneId: string, elementId: string): { project: StudioProject; elementId: string } | null {
  const scene = project.scenes.find((s) => s.id === sceneId);
  const index = scene ? scene.elements.findIndex((el) => el.id === elementId) : -1;
  if (!scene || index < 0) return null;
  const copy = { ...JSON.parse(JSON.stringify(scene.elements[index])), id: uid() } as StudioElement;
  const elements = [...scene.elements];
  elements.splice(index + 1, 0, copy);
  return {
    project: { ...project, updatedAt: new Date().toISOString(), scenes: project.scenes.map((s) => (s.id === sceneId ? { ...s, elements } : s)) },
    elementId: copy.id,
  };
}

/** Copie complète d'un projet (nouvel id, nouveaux ids de scènes et calques). */
export function duplicateProject(project: StudioProject, name?: string): StudioProject {
  const now = new Date().toISOString();
  return {
    ...JSON.parse(JSON.stringify(project)),
    id: uid(),
    name: (name ?? `${project.name} (copie)`).slice(0, 120),
    scenes: project.scenes.map((s) => cloneScene(s, s.name)),
    createdAt: now,
    updatedAt: now,
  };
}
