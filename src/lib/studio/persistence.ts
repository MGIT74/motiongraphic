import {
  deserializeProject,
  makeDefaultProject,
  serializeProject,
  type StudioProject,
} from "./project-model";

/**
 * Persistance Studio V1 : sauvegarde automatique locale (localStorage).
 * Phase 3 : la même interface pointera vers Supabase (`studio_projects`)
 * sans changer le reste de l'application — voir docs/studio-architecture.md.
 */

const KEY_INDEX = "mgsi:studio:index";
const keyFor = (projectId: string) => `mgsi:studio:project:${projectId}`;

export interface StudioProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listProjects(): StudioProjectIndexEntry[] {
  const store = safeLocalStorage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(KEY_INDEX) ?? "[]");
    return Array.isArray(raw) ? (raw as StudioProjectIndexEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveProject(project: StudioProject): boolean {
  const store = safeLocalStorage();
  if (!store) return false;
  try {
    store.setItem(keyFor(project.id), serializeProject(project));
    const index = listProjects().filter((e) => e.id !== project.id);
    index.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
    store.setItem(KEY_INDEX, JSON.stringify(index.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}

export function loadProject(projectId: string): StudioProject | null {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    return deserializeProject(store.getItem(keyFor(projectId)));
  } catch {
    return null;
  }
}

export function deleteProject(projectId: string): void {
  const store = safeLocalStorage();
  if (!store) return;
  store.removeItem(keyFor(projectId));
  void listProjects().filter((e) => e.id !== projectId);
}

/** Charge le dernier projet en date, sinon crée le projet de démonstration. */
export function loadLatestOrDefault(): StudioProject {
  const index = listProjects();
  if (index.length > 0) {
    const last = loadProject(index[0].id);
    if (last) return last;
  }
  return makeDefaultProject();
}