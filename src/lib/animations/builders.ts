"use client";

import gsap from "gsap";
import type { AnimationConfig } from "@/types/animation";

/**
 * Builders de timeline GSAP pilotables par le temps de la timeline Studio.
 *
 * - Chaque builder construit la même animation que le composant public
 *   correspondant (DOM + tweens identiques, les composants délèguent ici),
 *   donc un seul moteur, zéro duplication.
 * - `loop: true` (défaut, galerie) -> boucle infinie.
 * - `loop: false` (Studio) -> timeline finie, pilotable par `tl.time(t)` :
 *   lecture / pause / scrub frame-accurate, gelée à la fin (hold).
 *
 * Convention : le DOM initial = état final ; les tweens utilisent `from()`.
 */
export type AnimationBuilder = (
  root: HTMLElement,
  config: AnimationConfig,
  opts?: BuilderOptions
) => gsap.core.Timeline | void;

export interface BuilderOptions {
  loop?: boolean;
}

function tlOptions(loop: boolean, repeatDelay: number): gsap.TimelineVars {
  return loop ? { repeat: -1, repeatDelay } : { repeat: 0 };
}

/* ------------------------------------------------------------------ */
/* Kinetic Typography — kinetic-type-01                                */
/* ------------------------------------------------------------------ */

export function buildKineticType(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const letters = root.querySelectorAll<HTMLElement>("[data-letter-inner]");
  const dot = root.querySelector<HTMLElement>("[data-accent-dot]");
  if (!letters.length && !dot) return;

  const tl = gsap.timeline(tlOptions(loop, 0.9));
  tl.from(letters, {
    yPercent: 118,
    duration: Math.max(0.45, duration * 0.18),
    ease: "power3.out",
    stagger: 0.07,
  });
  if (dot) {
    tl.from(dot, { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(3)" }, "-=0.25");
  }
  // Début de la sortie : sert au timing « fit / hold » du Studio.
  tl.addLabel("out");
  tl.to(letters, {
    opacity: 0,
    yPercent: -40,
    duration: 0.6,
    ease: "power2.in",
    stagger: { each: 0.04, from: "end" },
  });
  if (dot) tl.to(dot, { scale: 0, opacity: 0, duration: 0.4, ease: "power2.in" }, "<");
  return tl;
}

/* ------------------------------------------------------------------ */
/* Text Reveal — text-reveal-01                                        */
/* ------------------------------------------------------------------ */

export function buildTextReveal(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const lines = root.querySelectorAll<HTMLElement>("[data-reveal-line]");
  const sweep = root.querySelector<HTMLElement>("[data-sweep]");
  if (!lines.length) return;

  const tl = gsap.timeline(tlOptions(loop, 0.9));
  tl.from(lines, {
    yPercent: 115,
    duration: Math.max(0.6, duration * 0.22),
    ease: "power4.out",
    stagger: 0.12,
  });
  if (sweep) {
    // Balayage lumineux : visible uniquement pendant son passage.
    tl.fromTo(
      sweep,
      { xPercent: -140, opacity: 0 },
      { xPercent: 240, opacity: 1, duration: 0.9, ease: "power2.inOut" },
      "-=0.35"
    );
    tl.to(sweep, { opacity: 0, duration: 0.2, ease: "none" }, ">-0.2");
  }
  // Début de la sortie : sert au timing « fit / hold » du Studio.
  tl.addLabel("out", `+=${Math.max(0.6, duration * 0.3)}`);
  tl.to(lines, {
    yPercent: -115,
    duration: 0.55,
    ease: "power2.in",
    stagger: 0.06,
  }, "out");
  return tl;
}

/* ------------------------------------------------------------------ */
/* Elastic Text — elastic-text-01                                      */
/* ------------------------------------------------------------------ */

export function buildElasticText(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const letters = root.querySelectorAll<HTMLElement>("[data-elastic-letter]");
  if (!letters.length) return;

  const tl = gsap.timeline(tlOptions(loop, 1));
  tl.from(letters, {
    scale: 0,
    opacity: 0,
    yPercent: 30,
    transformOrigin: "center bottom",
    duration: Math.max(0.7, duration * 0.3),
    ease: "elastic.out(1, 0.42)",
    stagger: 0.06,
  });
  // Début de la sortie : sert au timing « fit / hold » du Studio.
  tl.addLabel("out", `+=${Math.max(0.5, duration * 0.35)}`);
  tl.to(letters, {
    opacity: 0,
    scale: 0,
    transformOrigin: "center top",
    duration: 0.5,
    ease: "power2.in",
    stagger: { each: 0.05, from: "end" },
  }, "out");
  return tl;
}

/* ------------------------------------------------------------------ */
/* Shape Morph — shape-morph-01                                        */
/* ------------------------------------------------------------------ */

/** Formes à 8 sommets (interpolation clip-path fluide). */
export const MORPH_SHAPES = {
  square: "0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%",
  octagon: "29% 0%, 71% 0%, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0% 71%, 0% 29%",
  star: "50% 4%, 62.7% 37.3%, 96% 50%, 62.7% 62.7%, 50% 96%, 37.3% 62.7%, 4% 50%, 37.3% 37.3%",
} as const;

export function buildShapeMorph(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const morph = root.querySelector<HTMLElement>("[data-morph]");
  const halo = root.querySelector<HTMLElement>("[data-halo]");
  if (!morph) return;

  const seg = duration / 3;
  const tl = gsap.timeline(tlOptions(loop, 0.4));
  tl.to(morph, { clipPath: MORPH_SHAPES.octagon, duration: seg, ease: "sine.inOut" })
    .to(morph, { clipPath: MORPH_SHAPES.star, duration: seg, ease: "sine.inOut" })
    .to(morph, { clipPath: MORPH_SHAPES.square, duration: seg, ease: "sine.inOut" });
  if (halo) {
    tl.fromTo(
      halo,
      { scale: 1, opacity: 0.55 },
      { scale: 1.18, opacity: 0.15, duration: seg * 1.2, ease: "sine.inOut", yoyo: true, repeat: 2 },
      0
    );
  }
  tl.to(morph, { rotation: 360, duration: seg * 3, ease: "none" }, 0);
  return tl;
}

/* ------------------------------------------------------------------ */
/* Staggered Cards — staggered-cards-01                                */
/* ------------------------------------------------------------------ */

export function buildStaggeredCards(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const cards = root.querySelectorAll<HTMLElement>("[data-card]");
  if (!cards.length) return;

  const tl = gsap.timeline(tlOptions(loop, 0.8));
  tl.from(cards, {
    y: 44,
    opacity: 0,
    rotation: -6,
    duration: Math.max(0.55, duration * 0.16),
    ease: "back.out(1.7)",
    stagger: 0.16,
  });
  tl.from(root.querySelectorAll<HTMLElement>("[data-card-bar]"), {
    scaleX: 0,
    transformOrigin: "left center",
    duration: 0.4,
    ease: "power2.out",
    stagger: 0.08,
  });
  // Début de la sortie : sert au timing « fit / hold » du Studio.
  tl.addLabel("out", `+=${Math.max(0.7, duration * 0.34)}`);
  tl.to(cards, {
    y: -36,
    opacity: 0,
    duration: 0.45,
    ease: "power2.in",
    stagger: { each: 0.09, from: "end" },
  }, "out");
  return tl;
}

/* ------------------------------------------------------------------ */
/* Logo Reveal — logo-reveal-01                                        */
/* ------------------------------------------------------------------ */

export function buildLogoReveal(
  root: HTMLElement,
  config: AnimationConfig,
  opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const { duration } = config;
  const loop = opts.loop ?? true;

  const ring = root.querySelector<SVGCircleElement>("[data-ring]");
  const core = root.querySelector<SVGGraphicsElement>("[data-core]");
  const pulse = root.querySelector<SVGCircleElement>("[data-pulse]");
  const name = root.querySelector<HTMLElement>("[data-wordmark]");
  if (!ring && !core) return;

  const tl = gsap.timeline(tlOptions(loop, 0.9));
  if (ring) {
    const len = 2 * Math.PI * 46;
    tl.fromTo(
      ring,
      { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: Math.max(0.8, duration * 0.3), ease: "power2.inOut" }
    );
  }
  tl.from(
    core,
    { scale: 0, opacity: 0, transformOrigin: "center center", duration: 0.55, ease: "back.out(2.4)" },
    "-=0.15"
  );
  if (pulse) {
    tl.fromTo(
      pulse,
      { scale: 0.6, opacity: 0.7 },
      { scale: 1.35, opacity: 0, duration: Math.max(0.6, duration * 0.24), ease: "power2.out" },
      "-=0.4"
    );
  }
  if (name) {
    tl.from(name, { opacity: 0, y: 8, letterSpacing: "0.6em", duration: 0.6, ease: "power3.out" }, "-=0.35");
  }
  const hold = Math.max(0.6, duration * 0.34);
  // Début de la sortie : sert au timing « fit / hold » du Studio.
  tl.addLabel("out", `+=${hold}`);
  tl.to([core, ring, name].filter(Boolean), {
    opacity: 0,
    scale: 0.94,
    transformOrigin: "center center",
    duration: 0.45,
    ease: "power2.in",
  }, "out");
  return tl;
}

/** Premium notification stack — explicit fromTo states for deterministic Studio scrubbing. */
export function buildNotificationStackPremium(
  root: HTMLElement, config: AnimationConfig, opts: BuilderOptions = {}
): gsap.core.Timeline | void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-premium-notification]"));
  if (!cards.length) return;
  const tl = gsap.timeline(tlOptions(opts.loop ?? true, 0.65));
  const scale = Math.max(0.5, config.duration / 4.5);
  cards.forEach((card, index) => {
    const at = index * 0.42 * scale;
    tl.fromTo(card, { yPercent: 32, scale: 0.92, opacity: 0, rotationX: -8, filter: "blur(8px)" },
      { yPercent: 0, scale: 1, opacity: 1, rotationX: 0, filter: "blur(0px)", duration: 0.7 * scale, ease: "power3.out", immediateRender: false }, at);
    const icon = card.querySelector("[data-premium-icon]");
    const content = card.querySelector("[data-premium-content]");
    const glow = card.querySelector("[data-premium-glow]");
    if (icon) tl.fromTo(icon, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45 * scale, ease: "back.out(1.6)", immediateRender: false }, at + 0.18 * scale);
    if (content) tl.fromTo(content, { xPercent: 5, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.45 * scale, ease: "power2.out", immediateRender: false }, at + 0.23 * scale);
    if (glow) tl.fromTo(glow, { opacity: 0.35 }, { opacity: 0, duration: 0.65 * scale, ease: "sine.out", immediateRender: false }, at + 0.25 * scale);
  });
  tl.addLabel("out", cards.length * 0.42 * scale + Math.max(0.65, config.duration * 0.22));
  cards.slice().reverse().forEach((card, index) => {
    tl.to(card, { yPercent: -18, scale: 0.96, opacity: 0, filter: "blur(5px)", duration: 0.4 * scale, ease: "power2.in" }, "out+=" + (index * 0.12 * scale));
  });
  return tl;
}

/** Registre des builders, par clé de template. */
export const ANIMATION_BUILDERS: Record<string, AnimationBuilder> = {
  "kinetic-type-01": buildKineticType,
  "text-reveal-01": buildTextReveal,
  "notification-stack-premium-02": buildNotificationStackPremium,
  "elastic-text-01": buildElasticText,
  "shape-morph-01": buildShapeMorph,
  "staggered-cards-01": buildStaggeredCards,
  "logo-reveal-01": buildLogoReveal,
};