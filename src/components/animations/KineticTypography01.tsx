"use client";

import { useMemo } from "react";
import gsap from "gsap";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";

interface AnimatedLetter {
  char: string;
  accent: boolean;
}

/**
 * Kinetic Typography — apparition séquentielle des lettres,
 * glissement depuis le bas derrière un masque, point d'accent final.
 */
export default function KineticTypography01({
  config: { text, primaryColor, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const rows = useMemo<AnimatedLetter[][]>(
    () => {
      let globalIndex = 0;
      return text
        .toUpperCase()
        .split("\n")
        .filter(Boolean)
        .map((word) =>
          word
            .split("")
            .map((char) => ({ char, accent: globalIndex++ % 3 === 1 }))
        );
    },
    [text]
  );

  const rootRef = useAnimationEngine({
    deps: [rows, accentColor, duration, speed],
    speed,
    build: (root) => {
      const letters = root.querySelectorAll<HTMLElement>("[data-letter-inner]");
      const dot = root.querySelector<HTMLElement>("[data-accent-dot]");
      if (!letters.length && !dot) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.9 });
      tl.from(letters, {
        yPercent: 118,
        duration: Math.max(0.45, duration * 0.18),
        ease: "power3.out",
        stagger: 0.07,
      });
      if (dot) {
        tl.from(
          dot,
          { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(3)" },
          "-=0.25"
        );
      }
      tl.to(letters, {
        opacity: 0,
        yPercent: -40,
        duration: 0.6,
        ease: "power2.in",
        stagger: { each: 0.04, from: "end" },
      });
      if (dot) tl.to(dot, { scale: 0, opacity: 0, duration: 0.4, ease: "power2.in" }, "<");
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
        className="flex flex-col items-center justify-center gap-1 text-center"
        aria-label={text}
      >
        {rows.map((row, wi) => (
          <div key={`w-${wi}`} className="flex items-end justify-center">
            {row.map(({ char, accent }, li) => (
              <span
                key={`l-${wi}-${li}`}
                className="inline-block overflow-hidden align-bottom"
                style={{ paddingBottom: "0.06em" }}
              >
                {char === " " ? (
                  <span>&nbsp;</span>
                ) : (
                  <span
                    data-letter-inner
                    className="inline-block will-change-transform"
                    style={{
                      color: accent ? accentColor : primaryColor,
                      fontSize: "clamp(1.6rem, 7vw, 4.2rem)",
                      fontWeight: 800,
                      letterSpacing: "0.02em",
                      lineHeight: 1.15,
                    }}
                  >
                    {char}
                  </span>
                )}
              </span>
            ))}
            {wi === rows.length - 1 && (
              <span
                data-accent-dot
                className="ml-2 inline-block rounded-full will-change-transform"
                style={{
                  background: accentColor,
                  width: "clamp(0.5rem, 1.6vw, 0.9rem)",
                  height: "clamp(0.5rem, 1.6vw, 0.9rem)",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}