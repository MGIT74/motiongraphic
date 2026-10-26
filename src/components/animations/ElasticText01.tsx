"use client";

import { useMemo } from "react";
import gsap from "gsap";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";

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
    build: (root) => {
      const letters = root.querySelectorAll<HTMLElement>("[data-elastic-letter]");
      if (!letters.length) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
      tl.from(letters, {
        scale: 0,
        opacity: 0,
        yPercent: 30,
        transformOrigin: "center bottom",
        duration: Math.max(0.7, duration * 0.3),
        ease: "elastic.out(1, 0.42)",
        stagger: 0.06,
      });
      tl.to(letters, {
        opacity: 0,
        scale: 0,
        transformOrigin: "center top",
        duration: 0.5,
        ease: "power2.in",
        stagger: { each: 0.05, from: "end" },
        delay: Math.max(0.5, duration * 0.35),
      });
      return tl;
    },
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