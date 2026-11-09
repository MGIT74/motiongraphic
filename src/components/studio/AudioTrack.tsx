"use client";

import { useEffect, useRef } from "react";
import { audioClipLength, type ProjectAudio } from "@/lib/studio/project-model";

/** Volume de la musique à l'instant t (fondus d'entrée et de sortie). */
export function audioGainAt(audio: ProjectAudio, time: number, projectDuration: number, assetDuration?: number): number {
  const local = time - audio.start;
  const len = audioClipLength(audio, assetDuration, projectDuration);
  if (audio.muted || local < 0 || local > len || time > projectDuration) return 0;
  const fadeIn = audio.fadeIn > 0 ? Math.min(1, local / audio.fadeIn) : 1;
  const fadeOut = audio.fadeOut > 0 ? Math.min(1, Math.max(0, (len - local) / audio.fadeOut)) : 1;
  return audio.volume * fadeIn * fadeOut;
}

/** Lecture de la musique du projet, calée sur l'horloge du Studio. */
export default function AudioTrack({
  audio,
  url,
  time,
  playing,
  projectDuration,
  assetDuration,
}: {
  audio: ProjectAudio | undefined;
  url: string | undefined;
  time: number;
  playing: boolean;
  projectDuration: number;
  assetDuration?: number;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !audio) return;
    const target = audio.trimStart + (time - audio.start);
    el.volume = Math.max(0, Math.min(1, audioGainAt(audio, time, projectDuration, assetDuration)));
    const ended = time - audio.start > audioClipLength(audio, assetDuration, projectDuration);
    if (!playing || target < 0 || ended) {
      if (!el.paused) el.pause();
      if (target >= 0 && Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
      return;
    }
    if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
    if (el.paused) void el.play().catch(() => undefined);
  }, [audio, time, playing, projectDuration, assetDuration]);

  if (!audio || !url) return null;
  return <audio ref={ref} src={url} preload="auto" className="hidden" />;
}
