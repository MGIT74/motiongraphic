"use client";

import { useEffect, useRef, useState } from "react";
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
  // Temps courant lisible depuis l'effet de lecture sans le relancer à chaque frame.
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  const duration = project.scenes.reduce((acc, s) => acc + s.duration, 0);
  const fps = project.fps || 30;

  useEffect(() => {
    if (!playing) return;

    let last: number | null = null;
    // Reprend là où se trouve le curseur ; recommence au début si on est à la fin.
    let current = timeRef.current >= duration - 1 / fps ? 0 : timeRef.current;

    let rafId = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
      last = now;
      current += dt;
      timeRef.current = current;
      if (current >= duration) {
        timeRef.current = duration;
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(Math.round(current * fps) / fps);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    // Annule la DERNIÈRE frame programmée (pas seulement la première),
    // sinon la boucle continue d'avancer le temps après la pause.
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [playing, duration, fps]);

  const seek = (t: number) => {
    setPlaying(false);
    const next = Math.max(0, Math.min(duration, Math.round(t * fps) / fps));
    timeRef.current = next;
    setTime(next);
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