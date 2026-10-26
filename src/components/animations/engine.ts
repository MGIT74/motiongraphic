"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export interface UseAnimationEngineOptions {
  /** Construit la timeline GSAP. Retourner void/vide pour un rendu statique (reduced motion). */
  build: (root: HTMLElement) => gsap.core.Timeline | void;
  /** Dépendances de reconstruction (valeurs de config modifiables par le futur Studio). */
  deps: React.DependencyList;
  /** Multiplicateur de vitesse (0.25 - 3). */
  speed?: number;
}

/**
 * Moteur partagé de toutes les animations :
 * - construit une timeline GSAP dans un contexte (nettoyage automatique au démontage) ;
 * - respecte `prefers-reduced-motion` (aucune timeline, état final naturel) ;
 * - met en pause hors du viewport et relance au retour (IntersectionObserver).
 *
 * Convention : le DOM initial doit correspondre à l'état FINAL de l'animation,
 * les composants utilisent donc `gsap.from()` / `timeline.from()`.
 */
export function useAnimationEngine({ build, deps, speed = 1 }: UseAnimationEngineOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ctx: gsap.Context | undefined;
    if (!reduced) {
      ctx = gsap.context(() => {
        const tl = build(root);
        if (tl) {
          tl.pause();
          timelineRef.current = tl;
        }
      }, root);
    }
    setInView(false);

    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0.15 }
    );
    observer.observe(root);

    return () => {
      observer.disconnect();
      if (ctx) ctx.revert();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    const safeSpeed = Math.min(3, Math.max(0.25, speed));
    tl.timeScale(safeSpeed);
    if (inView) tl.play(0);
    else tl.pause();
  }, [inView, speed]);

  return rootRef;
}