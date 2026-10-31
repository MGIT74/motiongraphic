"use client";

import { useEffect, useRef, useState } from "react";
import type { StudioElement } from "@/lib/studio/project-model";
import type { StudioProject } from "@/lib/studio/project-model";
import {
  appendElement,
  makeDefaultProject,
  makeElement,
  makeScene,
  removeElement,
  replaceElementTemplate,
  sceneOffsets,
  updateElement,
} from "@/lib/studio/project-model";
import { getStudioTemplate, registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import { loadLatestOrDefault, saveProject } from "@/lib/studio/persistence";
import { useProjectHistory } from "@/lib/studio/history";
import { useStudioClock } from "@/lib/studio/clock";
import StudioTopBar from "./StudioTopBar";
import StudioLeftPanel from "./StudioLeftPanel";
import StudioCanvas from "./StudioCanvas";
import StudioRightPanel from "./StudioRightPanel";
import StudioTimeline from "./StudioTimeline";

/**
 * MotionGraphic Studio V1 Bêta — orchestrateur.
 *
 * Phase 1 (fondations) + remplacement instantané (Phase 2) :
 * - projet versionné (scènes, éléments, configs) ;
 * - canvas animé piloté par la timeline (lecture/pause/scrub) ;
 * - sélection d'éléments + propriétés texte/couleurs/position/durée ;
 * - remplacement du template par un style compatible (texte/couleurs
 *   conservés) avec Annuler ;
 * - sauvegarde automatique locale (Supabase en Phase 3).
 */
function computeSelection(
  project: StudioProject,
  selectedElementId: string | null
): { element: StudioElement; scene: StudioProject["scenes"][number]; sceneIndex: number } | null {
  if (!selectedElementId) return null;
  for (let i = 0; i < project.scenes.length; i += 1) {
    const scene = project.scenes[i];
    const element = scene.elements.find((el) => el.id === selectedElementId);
    if (element) return { element, scene, sceneIndex: i };
  }
  return null;
}

export default function StudioApp({
  customTemplates = [],
}: {
  /** Templates personnalisés PUBLIÉS (serveur) — bibliothèque commune + timeline. */
  customTemplates?: {
    id: string;
    slug: string;
    name: string;
    category: string;
    sourceKind: string;
    componentKey?: string;
    elementKind: string;
    defaultConfig: import("@/types/animation").AnimationConfig;
  }[];
}) {
  const [initial] = useState(loadLatestOrDefault);
  const { project, canUndo, canRedo, commit, undo, redo, reset } = useProjectHistory(initial);
  const clock = useStudioClock(project);

  // Enregistre les templates custom PUBLIÉS dans le registre runtime
  // (une fois par liste ; les temps pilotés passent par le composant de base).
  const registeredRef = useRef<string>("");
  useEffect(() => {
    if (!customTemplates.length) return;
    const signature = customTemplates.map((t) => t.slug).join("|");
    if (registeredRef.current === signature) return;
    registeredRef.current = signature;
    registerCustomStudioTemplates(customTemplates);
  }, [customTemplates]);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("saved");

  const { time, playing, duration, sceneIndex, seek, setPlaying } = clock;

  const selection = computeSelection(project, selectedElementId);

  /* ------------------------------ autosave ------------------------------ */
  // "saving" n'est pas posé dans l'effet (règle setState-in-effect) : les
  // états sauvegardé/erreur sont déduits du dernier cycle d'autosave.
  useEffect(() => {
    const id = setTimeout(() => {
      const ok = saveProject(project);
      setSaveState(ok ? "saved" : "error");
    }, 600);
    return () => clearTimeout(id);
  }, [project]);

  /* --------------------------- raccourcis clavier ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying(!playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, playing, setPlaying]);

  /* ------------------------------ navigation ------------------------------ */
  const offsets = sceneOffsets(project);

  const jumpToScene = (index: number) => seek(offsets[index] + 0.001);

  const addScene = () => commit(
    { ...project, scenes: [...project.scenes, makeScene(`Scène ${project.scenes.length + 1}`)] },
    "add-scene"
  );

  const deleteScene = (index: number) => {
    if (project.scenes.length <= 1) return;
    commit({ ...project, scenes: project.scenes.filter((_, i) => i !== index) }, "delete-scene");
    seek(0);
  };

  const renameScene = (index: number, name: string) =>
    commit(
      { ...project, scenes: project.scenes.map((s, i) => (i === index ? { ...s, name } : s)) },
      "rename-scene",
      `rename:${project.scenes[index].id}`
    );

  const updateSceneDuration = (index: number, duration: number) =>
    commit(
      { ...project, scenes: project.scenes.map((s, i) => (i === index ? { ...s, duration } : s)) },
      "duration-scene",
      `scen-duration:${project.scenes[index].id}`
    );

  /* ---------------------------- éléments --------------------------------- */
  const addElement = (sceneIndexAt: number, templateKey: string) => {
    const template = getStudioTemplate(templateKey);
    if (!template) return;
    const scene = project.scenes[sceneIndexAt];
    if (!scene) return;
    let start = 0;
    scene.elements.forEach((el) => {
      start = Math.max(start, el.start + el.duration);
    });
    const element = makeElement(templateKey, template.elementKind, { ...template.defaultConfig }, {
      start,
      duration: template.timelineDuration,
      label: template.name,
    });
    commit(appendElement(project, scene.id, element), "add-element");
    setSelectedElementId(element.id);
    seek(offsets[sceneIndexAt] + start + 0.2);
  };

  const changeElementTemplate = (elementId: string, newTemplateKey: string) => {
    const located = selection;
    if (!located || located.element.id !== elementId) return;
    const next = replaceElementTemplate(project, located.scene.id, elementId, newTemplateKey);
    if (next) commit(next, "replace-template", `replace:${elementId}:${newTemplateKey}`);
  };

  const patchElement = (elementId: string, patch: Partial<StudioElement>) => {
    const located = selection;
    if (!located || located.element.id !== elementId) return;
    const next = updateElement(project, located.scene.id, elementId, (el) => ({ ...el, ...patch }));
    commit(next, "update-element", `patch:${elementId}:${Object.keys(patch).join(",")}`);
  };

  const deleteElement = (elementId: string) => {
    const located = selection;
    if (!located) return;
    commit(removeElement(project, located.scene.id, elementId), "delete-element");
    setSelectedElementId(null);
  };

  const newProject = () => {
    const fresh = makeDefaultProject();
    reset(fresh);
    setSelectedElementId(null);
    seek(0);
    setSaveState("idle");
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-ink">
      <StudioTopBar
        projectName={project.name}
        onRename={(name) => commit({ ...project, name }, "rename-project", `name:${name}`)}
        onNewProject={newProject}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        playing={playing}
        onTogglePlay={() => setPlaying(!playing)}
        time={time}
        duration={duration}
        saveState={saveState}
        fps={project.fps}
      />

      <div className="flex min-h-0 flex-1">
        <StudioLeftPanel
          project={project}
          currentSceneIndex={sceneIndex}
          onJumpToScene={jumpToScene}
          onAddScene={addScene}
          onDeleteScene={deleteScene}
          onRenameScene={renameScene}
          onUpdateSceneDuration={updateSceneDuration}
          onAddElement={(templateKey) => addElement(sceneIndex, templateKey)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <StudioCanvas
            project={project}
            time={time}
            playing={playing}
            sceneIndex={sceneIndex}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
          <StudioTimeline
            project={project}
            time={time}
            duration={duration}
            sceneIndex={sceneIndex}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onSeek={seek}
            onMoveElement={(sceneId, elementId, start) =>
              commit(updateElement(project, sceneId, elementId, (el) => ({ ...el, start })), "move-element", `move:${elementId}`)
            }
            onResizeElement={(sceneId, elementId, duration) =>
              commit(updateElement(project, sceneId, elementId, (el) => ({ ...el, duration })), "resize-element", `resize:${elementId}:${duration.toFixed(2)}`)
            }
            onDeleteElement={deleteElement}
          />
        </div>

        <StudioRightPanel
          project={project}
          selection={selection}
          time={time}
          onChangeTemplate={changeElementTemplate}
          onPatchElement={patchElement}
          onDeleteElement={deleteElement}
        />
      </div>
    </div>
  );
}