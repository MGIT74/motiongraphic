import { useCallback, useRef, useState } from "react";
import type { StudioProject } from "./project-model";

/**
 * Historique Annuler/Rétablir par snapshots immuables du projet.
 * - `commit` pousse l'état courant dans le passé et repart du nouvel état ;
 * - `coalesceKey` permet de fusionner les modifications continues
 *   (saisie de texte, glissement d'élément) en une seule entrée.
 */
export interface ProjectHistory {
  past: StudioProject[];
  present: StudioProject;
  future: StudioProject[];
}

const MAX_HISTORY = 80;

export function useProjectHistory(initial: StudioProject) {
  const [history, setHistory] = useState<ProjectHistory>({
    past: [],
    present: initial,
    future: [],
  });
  const lastCoalesceRef = useRef<string | null>(null);

  const commit = useCallback((next: StudioProject, label: string, coalesceKey?: string) => {
    setHistory((h) => {
      const shouldCoalesce = coalesceKey !== undefined && lastCoalesceRef.current === coalesceKey;
      lastCoalesceRef.current = coalesceKey ?? null;
      return {
        past: shouldCoalesce ? h.past : [...h.past, h.present].slice(-MAX_HISTORY),
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    lastCoalesceRef.current = null;
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future].slice(0, MAX_HISTORY),
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastCoalesceRef.current = null;
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: next,
        future: rest,
      };
    });
  }, []);

  const reset = useCallback((project: StudioProject) => {
    lastCoalesceRef.current = null;
    setHistory({ past: [], present: project, future: [] });
  }, []);

  return {
    project: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    undo,
    redo,
    reset,
  };
}