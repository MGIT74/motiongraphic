"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildTextReveal } from "@/lib/animations/builders";

/**
 * Text Reveal — révélation du texte par masque vertical, ligne par ligne,
 * avec un balayage lumineux et une sortie douce en boucle.
 */
export default function TextReveal01({
  config: { text, primaryColor, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const lines = text.toUpperCase().split("\n").filter(Boolean);

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildTextReveal(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor }}
    >
      <div className="relative flex flex-col items-start justify-center text-center sm:items-center">
        {lines.map((line, i) => (
          <div key={`line-${i}`} className="overflow-hidden py-1" style={{ paddingBottom: "0.12em" }}>
            <span
              data-reveal-line
              className="block will-change-transform"
              style={{
                color: primaryColor,
                fontSize: "clamp(1.5rem, 6.5vw, 3.8rem)",
                fontWeight: 750,
                letterSpacing: "0.03em",
                lineHeight: 1.1,
              }}
            >
              {line}
            </span>
          </div>
        ))}
        <div
          data-sweep
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 opacity-70 blur-md"
          style={{
            background: `linear-gradient(100deg, transparent, ${accentColor}, transparent)`,
            mixBlendMode: "screen",
          }}
        />
      </div>
    </div>
  );
}