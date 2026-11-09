"use client";

import { useMemo } from "react";
import type { AnimationComponentProps } from "@/types/animation";
import { alignLayout, typoVars } from "@/lib/animations/config";
import { useAnimationEngine } from "./engine";
import { buildKineticType } from "@/lib/animations/builders";

interface AnimatedLetter {
  char: string;
  accent: boolean;
}

/**
 * Kinetic Typography — apparition séquentielle des lettres,
 * glissement depuis le bas derrière un masque, point d'accent final.
 *
 * `KineticTypography01Frame` = DOM pur (réutilisé tel quel par le Studio :
 * le moteur de timeline Studio reconstruit la même animation avec
 * `buildKineticType`).
 */
export function KineticTypography01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor } = config;
  const lay = alignLayout(config.align);
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

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor, minHeight: "100%", containerType: "size", ...lay.outer, ...(typoVars(config) as React.CSSProperties) }}
    >
      <div
        className="flex flex-col justify-center gap-1"
        style={lay.block}
        aria-label={text}
      >
        {rows.map((row, wi) => (
          <div key={`w-${wi}`} className="flex items-end" style={lay.row}>
            {row.map(({ char, accent }, li) => (
              <span
                key={`l-${wi}-${li}`}
                className="inline-block overflow-hidden align-bottom"
                style={{ paddingBottom: "0.06em" }}
              >
                {char === " " ? (
                  // Espace à la taille du titre (sinon les mots se collent).
                  <span style={{ fontSize: "calc(12cqmin * var(--mg-fs))", lineHeight: "calc(1.15 * var(--mg-lh))", letterSpacing: "var(--mg-ls)", wordSpacing: "var(--mg-ws)" }}>&nbsp;</span>
                ) : (
                  <span
                    data-letter-inner
                    className="inline-block will-change-transform"
                    style={{
                      color: accent ? accentColor : primaryColor,
                      fontSize: "calc(12cqmin * var(--mg-fs))",
                      fontWeight: 800,
                      letterSpacing: "calc(0.02em + var(--mg-ls))",
                      wordSpacing: "var(--mg-ws)",
                      lineHeight: "calc(1.15 * var(--mg-lh))",
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
                  width: "2.6cqmin",
                  height: "2.6cqmin",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KineticTypography01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;
  const rows = useMemo(() => text.toUpperCase().split("\n").filter(Boolean), [text]);

  const rootRef = useAnimationEngine({
    deps: [rows, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildKineticType(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <KineticTypography01Frame config={config} />
    </div>
  );
}