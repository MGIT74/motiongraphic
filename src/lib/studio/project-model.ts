import { isComponentKey } from "@/lib/animations/registry";
import { getStudioTemplate, isStudioTemplateKey, underlyingComponentKeyOf } from "@/lib/studio/template-registry";
import { sanitizeConfig } from "@/lib/animations/config";
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

export type ElementKind = "text" | "shape" | "cards" | "logo";

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
}

export interface StudioScene {
  id: string;
  name: string;
  duration: number;
  elements: StudioElement[];
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
  /** Phase 3 : médias importés (rushs, images, logos) — découpés virtuellement. */
  media: unknown[];
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
  opts: { start?: number; duration?: number; x?: number; y?: number; scale?: number; label?: string } = {}
): StudioElement {
  return {
    id: uid(),
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

export function makeScene(name: string, duration = 5, elements: StudioElement[] = []): StudioScene {
  return { id: uid(), name, duration: roundToFrame(clampNumber(duration, 1, 600)), elements };
}

export function makeDefaultProject(name = "Nouveau projet SaaS"): StudioProject {
  const now = new Date().toISOString();
  return {
    id: uid(),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    fps: STUDIO_FPS,
    width: 1920,
    height: 1080,
    scenes: [
      makeScene("Intro", 5, [
        makeElement("kinetic-type-01", "text", {
          text: "Votre SaaS",
          primaryColor: "#F5F5F7",
          accentColor: "#64D2FF",
          backgroundColor: "#000000",
          duration: 3.2,
          speed: 1,
        }, { duration: 5, label: "Titre" }),
      ]),
      makeScene("Démo produit", 6, [
        makeElement("staggered-cards-01", "cards", {
          text: "UI MOTION",
          primaryColor: "#E7E7EF",
          accentColor: "#0A84FF",
          backgroundColor: "#000000",
          duration: 4.2,
          speed: 1,
        }, { duration: 6, label: "Cards UI" }),
      ]),
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
        if (typeof e.templateKey !== "string" || !(isComponentKey(e.templateKey) || isStudioTemplateKey(e.templateKey))) return null;
        const kind = e.kind as ElementKind;
        if (kind !== "text" && kind !== "shape" && kind !== "cards" && kind !== "logo") return null;
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
        });
      }
      scenes.push({
        id: s.id,
        name: typeof s.name === "string" ? s.name.slice(0, 80) : "Scène",
        duration: sceneDuration,
        elements,
      });
    }

    return {
      id: typeof raw.id === "string" ? raw.id.slice(0, 64) : uid(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: typeof raw.name === "string" ? raw.name.slice(0, 120) : "Projet Studio",
      fps: STUDIO_FPS,
      width: clampNumber(Number(raw.width), 320, 3840),
      height: clampNumber(Number(raw.height), 320, 2160),
      scenes,
      media: Array.isArray(raw.media) ? raw.media : [],
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