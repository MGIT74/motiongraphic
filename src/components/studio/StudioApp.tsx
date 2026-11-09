"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "@/app/studio-fonts.css";
import type { BrandKit, MediaAsset, ProjectAudio, ProjectFormat, SceneTransition, StudioElement } from "@/lib/studio/project-model";
import type { StudioProject } from "@/lib/studio/project-model";
import {
  addMediaAsset,
  appendElement,
  duplicateElement,
  duplicateProject,
  duplicateScene,
  FRAME_SECONDS,
  applyBrand,
  brandedConfig,
  insertMediaElement,
  makeMediaElement,
  setProjectAudio,
  formatOf,
  moveElementLayer,
  setProjectFormat,
  updateScene,
  makeDefaultProject,
  makeElement,
  makeScene,
  removeElement,
  replaceElementTemplate,
  roundToFrame,
  sceneIndexAtTime,
  sceneOffsets,
  updateElement,
} from "@/lib/studio/project-model";
import { getStudioTemplate, registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import { deleteProject as deleteLocalProject, loadLatestOrDefault, loadProject as loadLocalProject, saveProject } from "@/lib/studio/persistence";
import {
  deleteCloudProject,
  fetchCloudVersion,
  loadCloudProject,
  loadLatestCloudProject,
  saveProjectToCloud,
  type CloudProject,
  type CloudSaveState as CloudStateKind,
} from "@/lib/studio/projects-supabase";
import { useProjectHistory } from "@/lib/studio/history";
import { useStudioClock } from "@/lib/studio/clock";
import StudioTopBar from "./StudioTopBar";
import StudioLeftPanel, { type LeftPanelTab } from "./StudioLeftPanel";
import StudioCanvas from "./StudioCanvas";
import StudioRightPanel, { CompatibleStyles } from "./StudioRightPanel";
import StudioTimeline from "./StudioTimeline";
import ExportButton from "./ExportButton";
import ProjectsMenu from "./ProjectsMenu";
import { MOBILE_TABS, MobileNav, MobileSheet, useCompactStudio, type MobileSheetId } from "./MobileSheet";
import { ToastProvider, useToasts } from "./Toasts";
import AudioTrack from "./AudioTrack";
import { MediaRuntimeContext } from "./MediaLayer";

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

export default function StudioApp(props: StudioAppProps) {
  return (
    <ToastProvider>
      <StudioAppInner {...props} />
    </ToastProvider>
  );
}

type StudioAppProps = {
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
};

function StudioAppInner({ customTemplates = [] }: StudioAppProps) {
  // Initial DÉTERMINISTE : le rendu serveur et le premier rendu client sont
  // identiques ; le contenu réel (localStorage/nuage) est restauré après
  // l'hydratation via `reset`.
  const [initial] = useState(() => makeDefaultProject(undefined, { deterministic: true }));
  const { project, canUndo, canRedo, commit, undo, redo, reset } = useProjectHistory(initial);
  const clock = useStudioClock(project);


  // Enregistre les templates custom PUBLIÉS dans le registre runtime
  // (une fois par liste) puis force un re-rendu : la bibliothèque lit le
  // registre module (muté) — le signal la resynchronise même au repos.
  const registeredRef = useRef<string>("");
  const [templatesVersion, bumpTemplatesVersion] = useState(0);
  useEffect(() => {
    if (!customTemplates.length) return;
    const signature = customTemplates.map((t) => t.slug).join("|");
    if (registeredRef.current === signature) return;
    registeredRef.current = signature;
    registerCustomStudioTemplates(customTemplates);
    bumpTemplatesVersion((v) => v + 1);
  }, [customTemplates]);

  const toasts = useToasts();
  const toastsRef = useRef(toasts);
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);
  // La version des templates (bumpé à l'enregistrement) force le re-rendu
  // des panneaux qui lisent le registre module.
  void templatesVersion;
  const cloudErrorShownRef = useRef(false);
  const saveNowRef = useRef<(target: StudioProject) => Promise<void>>(async () => {});

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  // Disposition mobile (< 1024 px) : panneaux en bas, ouverts depuis la barre d'onglets.
  const compact = useCompactStudio();
  const [sheet, setSheet] = useState<MobileSheetId | null>(null);
  const [fxOpen, setFxOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("saved");
  const [cloudState, setCloudState] = useState<CloudStateKind | null>(null);

  /* ----------------------- synchronisation cloud ----------------------- */
  // Version distante connue (updated_at) : undefined = projet jamais synchronisé.
  const remoteVersionRef = useRef<string | undefined>(undefined);
  // Prochaine sauvegarde à ignorer (le projet vient d'être chargé depuis le cloud).
  const skipSaveRef = useRef(false);
  // Modifications locales pas encore enregistrées dans le cloud.
  const dirtyRef = useRef(false);
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  /** Remplace le projet par sa version cloud, sans la réenregistrer. */
  const applyRemote = useCallback(
    (remote: CloudProject) => {
      skipSaveRef.current = true;
      dirtyRef.current = false;
      remoteVersionRef.current = remote.updatedAt;
      reset(remote.project);
      setCloudState("synced");
    },
    [reset]
  );

  /* Restauration après hydratation : lien ?project=, sinon localStorage puis cloud
     (si plus récent). Déclarée APRÈS l'enregistrement des templates custom pour que
     les projets qui en utilisent passent la validation. */
  useEffect(() => {
    const restore = async () => {
      // Lien direct vers un projet (ex. créé par le MCP) : /studio?project=<id>.
      const requestedId = new URLSearchParams(window.location.search).get("project");
      if (requestedId) {
        try {
          const requested = await loadCloudProject(requestedId);
          if (requested) {
            applyRemote(requested);
            return;
          }
        } catch {
          // Projet introuvable ou cloud indisponible : on retombe sur le dernier projet.
        }
      }
      const stored = loadLatestOrDefault();
      remoteVersionRef.current = undefined;
      reset(stored);
      try {
        const cloud = await loadLatestCloudProject();
        const localIsPlaceholder = stored.id === "project-default";
        if (cloud && (localIsPlaceholder || cloud.project.id === stored.id || Date.parse(cloud.updatedAt) > Date.parse(stored.updatedAt))) {
          applyRemote(cloud);
        }
      } catch {
        // Cloud indisponible : on garde le local, erreur silencieuse (assumé).
      }
    };
    void restore();
  }, [reset, applyRemote]);

  const { time, playing, duration, sceneIndex, seek, setPlaying } = clock;

  const selection = computeSelection(project, selectedElementId);

  /* ------------------------------- médias -------------------------------- */
  // URL de lecture signées des médias du projet (renouvelées quand la liste change).
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mediaKey = project.media.map((m) => m.id).join("|");
  useEffect(() => {
    const missing = project.media.filter((m) => !mediaUrls[m.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/studio/media/urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: missing.map((m) => ({ id: m.id, storagePath: m.storagePath })) }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { urls?: Record<string, string>; error?: string } | null;
      if (cancelled) return;
      if (body?.urls) setMediaUrls((prev) => ({ ...prev, ...body.urls }));
      if (!res || !res.ok || !body?.urls) {
        toastsRef.current.error(body?.error ?? (res ? `Erreur ${res.status}` : "Failed to fetch"), "media");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  /* ------------------------------ autosave ------------------------------ */
  // Local + cloud (Supabase RLS si configuré), sans écraser une version distante
  // plus récente (conflit signalé dans la barre du haut).
  const saveNow = useCallback(async (target: StudioProject) => {
    const ok = saveProject(target);
    setSaveState(ok ? "saved" : "error");
    const cloud = await saveProjectToCloud(target, remoteVersionRef.current).catch(
      (e: unknown) => ({ state: "error" as const, message: e instanceof Error ? e.message : String(e), updatedAt: undefined })
    );
    setCloudState(cloud.state);
    // Une seule notification par série d'échecs (la sauvegarde réessaie à chaque modification).
    if (cloud.state === "error" && !cloudErrorShownRef.current) {
      cloudErrorShownRef.current = true;
      toastsRef.current.error(cloud.message ?? "Échec de la sauvegarde cloud", "save", () => void saveNowRef.current(projectRef.current));
    }
    if (cloud.state === "synced") cloudErrorShownRef.current = false;
    if (cloud.state === "synced") {
      remoteVersionRef.current = cloud.updatedAt;
      if (projectRef.current === target) dirtyRef.current = false;
    }
  }, []);
  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      saveProject(project);
      return;
    }
    dirtyRef.current = true;
    const id = setTimeout(() => void saveNow(project), 600);
    return () => clearTimeout(id);
  }, [project, saveNow]);

  /* Rechargement en direct : si le projet a été modifié ailleurs (MCP, autre onglet)
     et qu'aucune modification locale n'est en attente, on affiche la nouvelle version. */
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || dirtyRef.current) return;
      const current = projectRef.current;
      if (remoteVersionRef.current === undefined) return;
      try {
        const version = await fetchCloudVersion(current.id);
        if (!version || Date.parse(version) <= Date.parse(remoteVersionRef.current) + 1) return;
        if (dirtyRef.current || projectRef.current !== current) return;
        const remote = await loadCloudProject(current.id);
        if (remote) applyRemote(remote);
      } catch {
        // Réseau indisponible : nouvel essai au prochain intervalle.
      }
    }, 4000);
    return () => clearInterval(id);
  }, [applyRemote]);

  /** Conflit : recharger la version distante… */
  const reloadRemote = async () => {
    const remote = await loadCloudProject(projectRef.current.id);
    if (remote) applyRemote(remote);
  };
  /** …ou garder la version locale (écrase la version distante). */
  const keepLocal = async () => {
    remoteVersionRef.current = (await fetchCloudVersion(projectRef.current.id)) ?? undefined;
    await saveNow(projectRef.current);
  };

  /* --------------------------- raccourcis clavier ---------------------------- */
  // Les actions changent à chaque rendu : le raccourci appelle toujours la dernière version.
  const shortcutsRef = useRef<{ deleteElement: (id: string) => void; duplicateElement: (id: string) => void }>({
    deleteElement: () => {},
    duplicateElement: () => {},
  });
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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedElementId) {
        e.preventDefault();
        shortcutsRef.current.deleteElement(selectedElementId);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedElementId) {
        e.preventDefault();
        shortcutsRef.current.duplicateElement(selectedElementId);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Image par image (Maj : 1 seconde).
        e.preventDefault();
        const step = (e.shiftKey ? 1 : FRAME_SECONDS) * (e.key === "ArrowLeft" ? -1 : 1);
        setPlaying(false);
        seek(Math.max(0, Math.min(duration - FRAME_SECONDS, time + step)));
      } else if (e.key === "Escape") {
        setSelectedElementId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, playing, setPlaying, selectedElementId, seek, time, duration]);

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
    // Logique calques : dans une scène qui a déjà du contenu, le nouvel élément est sans fond (superposable).
    const baseConfig = brandedConfig({ ...template.defaultConfig }, template.elementKind, project.brand);
    if (scene.elements.length > 0 || !!(template as { sandboxCode?: string }).sandboxCode) baseConfig.backgroundColor = "transparent";
    const element = makeElement(templateKey, template.elementKind, baseConfig, {
      start,
      duration: template.timelineDuration,
      label: template.name,
      timing: "fit",
    });
    let next = appendElement(project, scene.id, element);
    // Élément ajouté après les autres : la scène s'allonge pour qu'il reste visible.
    if (start + element.duration > scene.duration) {
      next = updateScene(next, scene.id, { duration: start + element.duration });
    }
    commit(next, "add-element");
    setSelectedElementId(element.id);
    seek(offsets[sceneIndexAt] + start + 0.2);
  };

  /** Template déposé à l'instant global `at` (timeline ou aperçu) : dans la scène visée, à cet instant. */
  const addElementAt = (templateKey: string, at: number) => {
    const template = getStudioTemplate(templateKey);
    if (!template) return;
    const idx = Math.max(0, Math.min(project.scenes.length - 1, sceneIndexAtTime(project, at)));
    const scene = project.scenes[idx];
    const start = roundToFrame(Math.max(0, Math.min(scene.duration - 0.5, at - offsets[idx])));
    const element = makeElement(templateKey, template.elementKind, brandedConfig({ ...template.defaultConfig }, template.elementKind, project.brand), {
      start,
      duration: template.timelineDuration,
      label: template.name,
      timing: "fit",
    });
    let next = appendElement(project, scene.id, element);
    if (start + element.duration > scene.duration) {
      next = updateScene(next, scene.id, { duration: start + element.duration });
    }
    commit(next, "add-element");
    setSelectedElementId(element.id);
    seek(offsets[idx] + start + Math.min(0.6, element.duration / 2));
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
    // Retrouve la scène de l'élément par son ID (il n'est pas forcément sélectionné).
    const located = computeSelection(project, elementId);
    if (!located) return;
    commit(removeElement(project, located.scene.id, elementId), "delete-element");
    if (selectedElementId === elementId) setSelectedElementId(null);
  };

  const addAsset = (asset: MediaAsset) => commit(addMediaAsset(projectRef.current, asset), "add-media");

  const addMediaToScene = (asset: MediaAsset) => {
    if (asset.kind === "audio") return;
    const scene = project.scenes[sceneIndex];
    if (!scene) return;
    // Au-dessus des autres médias, sous les animations (qui restent lisibles par-dessus).
    const element = makeMediaElement(asset, { start: 0, duration: scene.duration, frame: asset.kind === "image" ? "browser" : "none" });
    commit(insertMediaElement(project, scene.id, element), "add-media-element");
    setSelectedElementId(element.id);
  };

  const setAudio = (audio: ProjectAudio | null) => commit(setProjectAudio(project, audio), "audio", "audio");

  const moveLayer = (elementId: string, target: "up" | "down" | "front" | "back" | number) => {
    const located = computeSelection(project, elementId);
    if (!located) return;
    commit(moveElementLayer(project, located.scene.id, elementId, target), "move-layer");
  };

  const changeFormat = (format: ProjectFormat) => commit(setProjectFormat(project, format), "format");

  const updateBrand = (brand: BrandKit) => commit({ ...project, brand }, "brand", "brand");
  const applyBrandToProject = (brand: BrandKit) => commit(applyBrand(project, brand), "apply-brand");

  const updateSceneBackground = (index: number, background: string) =>
    commit(updateScene(project, project.scenes[index].id, { background }), "scene-background", `scene-bg:${project.scenes[index].id}`);

  const updateSceneTransition = (index: number, transition: SceneTransition | null) =>
    commit(
      updateScene(project, project.scenes[index].id, { transition }),
      "scene-transition",
      `scene-tr:${project.scenes[index].id}`
    );

  const duplicateSceneAt = (index: number) => {
    const result = duplicateScene(project, project.scenes[index].id);
    if (!result) return;
    commit(result.project, "duplicate-scene");
    seek(sceneOffsets(result.project)[index + 1] + 0.001);
  };

  const duplicateElementById = (elementId: string) => {
    const located = computeSelection(project, elementId);
    if (!located) return;
    const result = duplicateElement(project, located.scene.id, elementId);
    if (!result) return;
    commit(result.project, "duplicate-element");
    setSelectedElementId(result.elementId);
  };

  useEffect(() => {
    shortcutsRef.current = { deleteElement, duplicateElement: duplicateElementById };
  });

  /* ------------------------------- projets ------------------------------- */
  const showProject = (next: StudioProject, remoteVersion?: string) => {
    if (remoteVersion) {
      applyRemote({ project: next, updatedAt: remoteVersion });
    } else {
      remoteVersionRef.current = undefined;
      reset(next);
    }
    setSelectedElementId(null);
    seek(0);
    try {
      window.history.replaceState(null, "", `/studio?project=${encodeURIComponent(next.id)}`);
    } catch {
      // Historique indisponible : sans conséquence.
    }
  };

  const fetchProjectById = async (id: string): Promise<{ project: StudioProject; updatedAt?: string } | null> => {
    const cloud = await loadCloudProject(id).catch(() => null);
    if (cloud) return cloud;
    const local = loadLocalProject(id);
    return local ? { project: local } : null;
  };

  const openProjectById = async (id: string) => {
    await saveNow(projectRef.current);
    const found = await fetchProjectById(id);
    if (!found) throw new Error("Projet introuvable.");
    showProject(found.project, found.updatedAt);
  };

  const duplicateProjectById = async (id: string) => {
    await saveNow(projectRef.current);
    const found = id === projectRef.current.id ? { project: projectRef.current } : await fetchProjectById(id);
    if (!found) throw new Error("Projet introuvable.");
    const copy = duplicateProject(found.project);
    saveProject(copy);
    const cloud = await saveProjectToCloud(copy);
    showProject(copy, cloud.state === "synced" ? cloud.updatedAt : undefined);
  };

  const deleteProjectById = async (id: string) => {
    if (id === projectRef.current.id) return false;
    deleteLocalProject(id);
    // Cloud (si connecté) : un échec réaffiche simplement le projet dans la liste.
    await deleteCloudProject(id).catch(() => false);
    return true;
  };

  const newProject = () => {
    const fresh = makeDefaultProject();
    remoteVersionRef.current = undefined;
    reset(fresh);
    setSelectedElementId(null);
    seek(0);
    setSaveState("idle");
  };

  const leftPanel = (variant: "sidebar" | "sheet", forcedTab?: LeftPanelTab) => (
    <StudioLeftPanel
      project={project}
      currentSceneIndex={sceneIndex}
      onJumpToScene={jumpToScene}
      onAddScene={addScene}
      onDeleteScene={deleteScene}
      onRenameScene={renameScene}
      onUpdateSceneDuration={updateSceneDuration}
      onAddElement={(templateKey) => {
        addElement(sceneIndex, templateKey);
        // Mobile : on referme le panneau pour voir le résultat.
        if (variant === "sheet") setSheet(null);
      }}
      onUpdateSceneBackground={updateSceneBackground}
      onUpdateBrand={updateBrand}
      onApplyBrand={applyBrandToProject}
      mediaUrls={mediaUrls}
      onAddAsset={addAsset}
      onAddMediaToScene={(asset) => {
        addMediaToScene(asset);
        if (variant === "sheet") setSheet(null);
      }}
      onSetAudio={setAudio}
      onUpdateSceneTransition={updateSceneTransition}
      onDuplicateScene={duplicateSceneAt}
      variant={variant}
      forcedTab={forcedTab}
    />
  );

  const rightPanel = (variant: "sidebar" | "sheet") => (
    <StudioRightPanel
      project={project}
      selection={selection}
      time={time}
      onChangeTemplate={changeElementTemplate}
      onPatchElement={patchElement}
      onDeleteElement={deleteElement}
      onMoveLayer={moveLayer}
      fxOpen={fxOpen}
      onToggleFx={() => setFxOpen((v) => !v)}
      onSelectElement={setSelectedElementId}
      variant={variant}
    />
  );

  const canvas = (
    <StudioCanvas
      project={project}
      time={time}
      playing={playing}
      sceneIndex={sceneIndex}
      selectedElementId={selectedElementId}
      onSelectElement={setSelectedElementId}
      onPatchElement={patchElement}
      onDropTemplate={(templateKey) => addElementAt(templateKey, time)}
      compact={compact}
    />
  );

  const stylesStrip =
    fxOpen && selection && selection.element.kind !== "media" ? (
      <CompatibleStyles
        element={selection.element}
        project={project}
        onChange={changeElementTemplate}
        layout="strip"
        onClose={() => setFxOpen(false)}
      />
    ) : null;

  const timeline = (
    <StudioTimeline
      project={project}
      time={time}
      duration={duration}
      sceneIndex={sceneIndex}
      selectedElementId={selectedElementId}
      onSelectElement={setSelectedElementId}
      onSeek={seek}
      onChangeTiming={(sceneId, elementId, timing, gesture) =>
        commit(updateElement(project, sceneId, elementId, (el) => ({ ...el, ...timing })), "timing-element", `timing:${elementId}:${gesture}`)
      }
      onDeleteElement={deleteElement}
      onToggleHidden={(ids, hidden) => {
        const scene = project.scenes[sceneIndex];
        if (!scene) return;
        let next = project;
        for (const id of ids) next = updateElement(next, scene.id, id, (el) => ({ ...el, hidden: hidden ? true : undefined }));
        commit(next, "toggle-hidden");
      }}
      onChangeAudio={(patch, gesture) => {
        if (!project.audio) return;
        commit(setProjectAudio(project, { ...project.audio, ...patch }), "audio-clip", `audio-clip:${gesture}`);
      }}
      onToggleAudioMuted={() => {
        if (!project.audio) return;
        commit(setProjectAudio(project, { ...project.audio, muted: project.audio.muted ? undefined : true }), "audio-muted");
      }}
      onDropTemplate={(templateKey, at) => addElementAt(templateKey, at)}
      compact={compact}
    />
  );

  return (
    <div
      className={`flex flex-col overflow-hidden bg-background text-ink ${compact ? "fixed inset-0 overscroll-none" : "h-svh"}`}
      style={compact ? { touchAction: "manipulation" } : undefined}
      data-studio-layout={compact ? "compact" : "desktop"}
    >
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
        cloudState={cloudState}
        fps={project.fps}
        format={formatOf(project)}
        onChangeFormat={changeFormat}
        onReloadRemote={() => void reloadRemote()}
        onKeepLocal={() => void keepLocal()}
        compact={compact}
        projectsSlot={
          <ProjectsMenu
            currentProjectId={project.id}
            onOpen={openProjectById}
            onDuplicate={duplicateProjectById}
            onDelete={deleteProjectById}
            compact={compact}
          />
        }
        exportSlot={
          <ExportButton
            projectId={project.id}
            compact={compact}
            beforeExport={async () => {
              await saveNow(projectRef.current);
              return remoteVersionRef.current !== undefined;
            }}
          />
        }
      />

      <MediaRuntimeContext.Provider value={{ urls: mediaUrls, deterministic: false, playing }}>
      <AudioTrack audio={project.audio} url={project.audio ? mediaUrls[project.audio.assetId] : undefined} time={time} playing={playing} projectDuration={duration} assetDuration={project.audio ? project.media.find((m) => m.id === project.audio?.assetId)?.duration : undefined} />
      {compact ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col">
            {canvas}
            {timeline}
          </div>
          <MobileNav open={sheet} onOpen={setSheet} hasSelection={selection !== null} />
          {sheet ? (
            <MobileSheet title={MOBILE_TABS.find((t) => t.id === sheet)?.label ?? ""} onClose={() => setSheet(null)}>
              {sheet === "properties" ? rightPanel("sheet") : leftPanel("sheet", sheet)}
            </MobileSheet>
          ) : null}
        </>
      ) : (
        <div className="flex min-h-0 flex-1">
          {leftPanel("sidebar")}
          <div className="flex min-w-0 flex-1 flex-col">
            {canvas}
            {stylesStrip}
            {timeline}
          </div>
          {rightPanel("sidebar")}
        </div>
      )}
      </MediaRuntimeContext.Provider>
    </div>
  );
}
