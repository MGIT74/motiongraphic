"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";

/**
 * Logo Reveal — logo abstrait (SVG) : tracé du cercle par la lumière,
 * halo pulsé, monogramme géométrique, mot-symbole révélé.
 */
export default function LogoReveal01({
  config: { text, primaryColor, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) => {
      const ring = root.querySelector<SVGCircleElement>("[data-ring]");
      const core = root.querySelector<SVGPolygonElement>("[data-core]");
      const pulse = root.querySelector<SVGCircleElement>("[data-pulse]");
      const name = root.querySelector<HTMLElement>("[data-wordmark]");
      if (!ring && !core) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.9 });
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
      tl.to([core, ring, name].filter(Boolean), {
        opacity: 0,
        scale: 0.94,
        transformOrigin: "center center",
        duration: 0.45,
        ease: "power2.in",
        delay: hold,
      });
      return tl;
    },
  });

  const accent = accentColor;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden p-6"
      style={{ backgroundColor }}
    >
      <svg viewBox="0 0 120 120" className="h-2/5 max-h-32 w-auto" aria-hidden="true" style={{ overflow: "visible" }}>
        <title>Logo abstrait</title>
        <circle data-pulse cx="60" cy="60" r="40" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
        <circle data-ring cx="60" cy="60" r="46" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        <polygon
          data-core
          points="60,34 82,72 38,72"
          fill={accent}
          opacity="0.92"
        />
        <polygon points="60,52 74,68 60,84 46,68" fill="#0A0A0D" opacity="0.55" />
      </svg>
      {text ? (
        <span
          data-wordmark
          className="text-xs font-bold uppercase sm:text-sm"
          style={{ color: accent }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}