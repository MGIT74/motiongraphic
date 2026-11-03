"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildTypewriter } from "@/lib/animations/builders";

/** Final-state DOM; GSAP exclusively controls the type-on and exit phases. */
export function Typewriter01Frame({ config }: AnimationComponentProps) {
  const text = (config.text || "YOUR NEXT IDEA").slice(0, 800);
  const lines = text.split("\n");
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor: config.backgroundColor, containerType: "size" }}>
      <div className="max-w-full" style={{ padding: "6cqmin", fontSize: "8cqmin", fontWeight: 650, lineHeight: 1.35, letterSpacing: "-0.025em", color: config.primaryColor }}>
        {lines.map((line, lineIndex) => (
          <div key={lineIndex} className="flex flex-wrap justify-center" style={{ minHeight: "1.35em" }}>
            {Array.from(line).map((character, charIndex) => (
              <span data-type-char key={charIndex} style={{ whiteSpace: "pre" }}>{character}</span>
            ))}
            <span data-type-cursor aria-hidden="true" style={{ display: "inline-block", width: "0.09em", height: "0.9em", backgroundColor: config.accentColor, marginLeft: "0.08em", verticalAlign: "baseline", alignSelf: "center" }} />
          </div>
        ))}

      </div>
    </div>
  );
}

export default function Typewriter01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed, config.fontFamily],
    speed: config.speed,
    build: (root) => buildTypewriter(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><Typewriter01Frame config={config} /></div>;
}
