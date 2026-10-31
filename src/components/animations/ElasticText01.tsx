"use client";

import { useMemo } from "react";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildElasticText } from "@/lib/animations/builders";

/**
 * Elastic Text — le texte rebondit en place avec un easing élastique,
 * lettre par lettre.
 */
export default function ElasticText01({
  config: { text, primaryColor, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const words = useMemo(
    () => {
      let globalIndex = 0;
      return text
        .toUpperCase()
        .split("\n")
        .filter(Boolean)
        .map((word) =>
          word
            .split("")
            .map((char) => ({ char, pop: globalIndex++ % 4 === 2 }))
        );
    },
    [text]
  );

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildElasticText(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor }}
    >
      <div
        className="flex flex-col items-center justify-center"
        aria-label={text}
      >
        {words.map((word, wi) => (
          <div key={`w-${wi}`} className="flex justify-center">
            {word.map(({ char, pop }, ci) => (
              <span
                key={`l-${wi}-${ci}`}
                className="inline-block overflow-visible align-bottom"
              >
                {char === " " ? (
                  <span className="inline-block">&nbsp;</span>
                ) : (
                  <span
                    data-elastic-letter
                    className="inline-block will-change-transform"
                    style={{
                      color: pop ? accentColor : primaryColor,
                      fontSize: "clamp(1.6rem, 7vw, 4rem)",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      lineHeight: 1.2,
                    }}
                  >
                    {char}
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}