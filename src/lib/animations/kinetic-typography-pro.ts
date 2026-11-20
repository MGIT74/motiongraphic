"use client";

import gsap from "gsap";
import type { AnimationConfig } from "@/types/animation";
import type { BuilderOptions } from "./builders";

/** Scrubbable GSAP timeline. DOM represents final visible state. */
export function buildKineticTypographyPro(root: HTMLElement, config: AnimationConfig, opts: BuilderOptions = {}): gsap.core.Timeline | void {
  const letters = root.querySelectorAll<HTMLElement>("[data-pro-letter]");
  const rule = root.querySelector<HTMLElement>("[data-pro-rule]");
  if (!letters.length) return;
  const duration = Math.max(2.5, config.duration);
  const stagger = Math.min(0.065, 0.85 / letters.length);
  const tl = gsap.timeline(opts.loop === false ? { repeat: 0 } : { repeat: -1, repeatDelay: 0.65 });
  tl.fromTo(letters, { yPercent: 120, opacity: 0, rotateX: -25, filter: "blur(9px)" },
    { yPercent: 0, opacity: 1, rotateX: 0, filter: "blur(0px)", duration: 0.72, ease: "power4.out", stagger });
  if (rule) tl.fromTo(rule, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, "-=0.22");
  tl.addLabel("out", `+=${Math.max(0.6, duration * 0.23)}`);
  tl.to(letters, { yPercent: -110, opacity: 0, filter: "blur(7px)", duration: 0.46, ease: "power3.in", stagger: { each: Math.min(0.03, 0.3 / letters.length), from: "end" } }, "out");
  if (rule) tl.to(rule, { scaleX: 0, opacity: 0, duration: 0.3, ease: "power2.in" }, "out");
  return tl;
}
