"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildLogoReveal } from "@/lib/animations/builders";

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
    build: (root) =>
      buildLogoReveal(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
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
        <polygon points="60,52 74,68 60,84 46,68" fill="#000000" opacity="0.55" />
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