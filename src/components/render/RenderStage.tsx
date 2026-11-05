"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "@/app/studio-fonts.css";
import StageLayers from "@/components/studio/StageLayers";
import { MediaRuntimeContext, pendingMediaWaits } from "@/components/studio/MediaLayer";
import { pendingCodeWaits, drainDegradedFrames } from "@/components/studio/sandbox-frame";
import { projectDuration, type StudioProject } from "@/lib/studio/project-model";
import { registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import type { StudioCustomTemplateInput } from "@/lib/render/server-projects";
import { renderStageSize } from "@/lib/render/stage-size";

import { getStudioTemplate } from "@/lib/studio/template-registry";

declare global {
  interface Window {
    __mgsiRender?: {
      ready: boolean;
      incompatible: string[];
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
  const [flushTick, setFlushTick] = useState(0);
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  });
  /** Attentes du flux de rendu : résolution OK / rejet (frame dégradée). */
  const waiters = useRef<{ resolve: () => void; reject: (reason: Error) => void }[]>([]);
  const size = useMemo(() => renderStageSize(project), [project]);

  // Templates non compatibles avec l'export (code sandbox sans contrat
  // déterministe) : le moteur MP4 refuse de produire une vidéo fausse.
  const incompatibleTemplates = useMemo(() => {
    const result: string[] = [];
    project.scenes.forEach((scene) =>
      scene.elements.forEach((el) => {
        const meta = getStudioTemplate(el.templateKey) as
          | { exportCompatible?: boolean; name?: string }
          | undefined;
        if (meta && meta.exportCompatible === false) {
          result.push(`${el.templateKey} (élément « ${el.label} »)`);
        }
      })
    );
    return result;
  }, [project]);

  // Après chaque changement d'instant : effets React + GSAP appliqués, puis
  // acks (médias, sandbox) — JAMAIS d'image dégradée encodée silencieusement.
  useEffect(() => {
    const pending = waiters.current;
    waiters.current = [];
    void (async () => {
      try {
        await nextFrame();
        await nextFrame();
        // Médias : chaque vidéo positionnée / image chargée.
        while (pendingMediaWaits.size > 0) await Promise.all(Array.from(pendingMediaWaits));
        // Templates sandbox (contrat renderAt) : chaque SEEK acquitté.
        while (pendingCodeWaits.size > 0) {
          await Promise.all(Array.from(pendingCodeWaits));
          // garde-fou : pas de boucle infinie si un ack rate
          if (pendingCodeWaits.size > 0) await nextFrame();
        }
        await nextFrame();
        const degraded = drainDegradedFrames();
        if (degraded.length > 0) {
          throw new Error(
            `FRAME_DÉGRADÉE : ${degraded.length} acquitement(s) sandbox en échec (${degraded
              .map((d) => `${d.sessionId}#${d.seq} ${d.reason}`)
              .join(", ")})`
          );
        }
        pending.forEach((w) => w.resolve());
      } catch (error) {
        pending.forEach((w) => w.reject(error instanceof Error ? error : new Error(String(error))));
      }
    })();
  }, [time, flushTick]);

  useEffect(() => {
    if (!registered) return;
    const api = {
      ready: true,
      incompatible: incompatibleTemplates,
      duration: projectDuration(project),
      fps: project.fps,
      width: project.width,
      height: project.height,
      seek: (t: number) =>
        new Promise<void>((resolve, reject) => {
          waiters.current.push({ resolve, reject });
          if (timeRef.current === t) {
            // Même instant : relance le flush (les acks éventuels sont traités).
            setFlushTick((v) => v + 1);
            return;
          }
          setTime(t);
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
  }, [registered, project, incompatibleTemplates]);

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
