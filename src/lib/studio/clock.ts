"use client";

import { useEffect, useState } from "react";
import { sceneIndexAtTime, type StudioProject } from "./project-model";

/**
 * Horloge du Studio : temps global continu piloté par rAF.
 * - lecture : avance en temps réel (fps du projet), s'arrête à la fin ;
 * - pause : fige ; seek : navigation instantanée (scrub) ;
 * - frame-accurate : positions arrondies au 1/fps.
 */
export function useStudioClock(project: StudioProject) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const duration = project.scenes.reduce((acc, s) => acc + s.duration, 0);
  const fps = project.fps || 30;

  useEffect(() => {
    if (!playing) return;

    let last: number | null = null;
    let current = 0;

    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
      last = now;
      current += dt;
      if (current >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(Math.round(current * fps) / fps);
      requestAnimationFrame(tick);
    };

    const rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, duration, fps]);

  const seek = (t: number) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(duration, Math.round(t * fps) / fps)));
  };

  return {
    time,
    playing,
    duration,
    sceneIndex: sceneIndexAtTime(project, time),
    setPlaying,
    seek,
  };
}