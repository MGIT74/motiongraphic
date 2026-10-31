"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildShapeMorph, MORPH_SHAPES as SHAPES } from "@/lib/animations/builders";

/**
 * Shape Morph — une forme géométrique se transforme continûment
 * (carré, octogone, étoile) via l'interpolation de clip-path.
 *
 * `ShapeMorph01Frame` = DOM pur (réutilisé tel quel par le Studio).
 */
export function ShapeMorph01Frame({ config }: AnimationComponentProps) {
  const { text, accentColor, backgroundColor } = config;

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor, minHeight: "100%" }}
    >
      <div className="relative flex h-2/5 w-auto max-w-[70%] items-center justify-center" style={{ aspectRatio: "1" }}>
        <div
          data-halo
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: accentColor,
            filter: "blur(38px)",
            opacity: 0.4,
          }}
        />
        <div
          data-morph
          className="relative h-full w-full will-change-transform"
          style={{
            clipPath: SHAPES.square,
            background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}88 55%, transparent 120%)`,
          }}
        />
      </div>
      {text ? (
        <span
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-[0.35em]"
          style={{ color: accentColor, opacity: 0.75 }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}

export default function ShapeMorph01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;

  const rootRef = useAnimationEngine({
    deps: [text, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildShapeMorph(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <ShapeMorph01Frame config={config} />
    </div>
  );
}