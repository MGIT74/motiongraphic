"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "@/app/studio-fonts.css";
import StageLayers from "@/components/studio/StageLayers";
import { MediaRuntimeContext, pendingMediaWaits } from "@/components/studio/MediaLayer";
import { projectDuration, type StudioProject } from "@/lib/studio/project-model";
import { registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import type { StudioCustomTemplateInput } from "@/lib/render/server-projects";
import { renderStageSize } from "@/lib/render/stage-size";

declare global {
  interface Window {
    __mgsiRender?: {
      ready: boolean;
      duration: number;
      fps: number;
      width: number;
      height: number;
      seek: (time: number) => Promise<void>;
    };
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Scène de rendu : le moteur du Studio (StageLayers) à un instant contrôlé par
 * le navigateur sans fenêtre via `window.__mgsiRender.seek(t)`.
 */
export default function RenderStage({
  project,
  customTemplates,
  mediaUrls = {},
}: {
  project: StudioProject;
  customTemplates: StudioCustomTemplateInput[];
  mediaUrls?: Record<string, string>;
}) {
  // Enregistrement des templates custom AVANT le premier rendu de la scène.
  const [registered] = useState(() => {
    registerCustomStudioTemplates(customTemplates);
    return true;
  });
  const [time, setTime] = useState(0);
  const waiters = useRef<(() => void)[]>([]);
  const size = useMemo(() => renderStageSize(project), [project]);

  // Après chaque changement d'instant : effets React + GSAP appliqués, puis 2 images.
  useEffect(() => {
    const pending = waiters.current;
    waiters.current = [];
    void (async () => {
      await nextFrame();
      await nextFrame();
      // Médias : attendre que chaque vidéo soit positionnée et chaque image chargée.
      while (pendingMediaWaits.size > 0) await Promise.all(Array.from(pendingMediaWaits));
      await nextFrame();
      pending.forEach((resolve) => resolve());
    })();
  }, [time]);

  useEffect(() => {
    if (!registered) return;
    const api = {
      ready: false,
      duration: projectDuration(project),
      fps: project.fps,
      width: project.width,
      height: project.height,
      seek: (t: number) =>
        new Promise<void>((resolve) => {
          waiters.current.push(resolve);
          setTime((prev) => {
            if (prev === t) {
              // Même instant : on libère quand même après deux images.
              void nextFrame().then(nextFrame).then(() => {
                const pending = waiters.current;
                waiters.current = [];
                pending.forEach((r) => r());
              });
            }
            return t;
          });
        }),
    };
    window.__mgsiRender = api;
    void (async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((img) => (img.decode ? img.decode().catch(() => undefined) : undefined))
      );
      api.ready = true;
    })();
  }, [registered, project]);

  return (
    <div
      className="fixed left-0 top-0 overflow-hidden"
      style={{ width: size.width, height: size.height, background: "#000" }}
      data-render-stage
    >
      <MediaRuntimeContext.Provider value={{ urls: mediaUrls, deterministic: true, playing: false }}>
        {registered ? <StageLayers project={project} time={time} /> : null}
      </MediaRuntimeContext.Provider>
    </div>
  );
}
