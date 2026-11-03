"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { buildLetterReveal } from "@/lib/animations/builders";
import { useAnimationEngine } from "./engine";

/** Static final-state DOM, reused by the Studio and frame-by-frame renderer. */
export function LetterReveal01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, fontFamily } = config;
  const lines = (text.slice(0, 800) || "MOTION").split("\n");
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor, containerType: "size", fontFamily: fontFamily || "inherit" }}>
      <div aria-label={text} className="relative flex max-w-full flex-col items-center justify-center"
        style={{ gap: "2cqmin", padding: "5cqmin" }}>
        {lines.map((line, i) => (
          <div key={i} className="flex max-w-full flex-wrap items-center justify-center"
            style={{ gap: "0.15em", fontSize: "clamp(1px, 11cqmin, 11cqmin)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.035em" }}>
            {Array.from(line || " ").map((letter, j) => (
              <span key={j} data-letter-reveal aria-hidden="true" className="inline-block"
                style={{ color: primaryColor, backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                  backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  whiteSpace: "pre", willChange: "transform,opacity,filter" }}>{letter}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LetterReveal01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed, config.fontFamily],
    speed: config.speed,
    build: (root) => buildLetterReveal(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><LetterReveal01Frame config={config} /></div>;
}
