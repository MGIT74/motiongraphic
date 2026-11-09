"use client";

import { useMemo } from "react";
import type { AnimationComponentProps } from "@/types/animation";
import { alignLayout, typoVars } from "@/lib/animations/config";
import { useAnimationEngine } from "./engine";
import { buildElasticText } from "@/lib/animations/builders";

interface ElasticLetter {
  char: string;
  pop: boolean;
}

/**
 * Elastic Text — le texte rebondit en place avec un easing élastique,
 * lettre par lettre.
 *
 * `ElasticText01Frame` = DOM pur (réutilisé tel quel par le Studio).
 */
export function ElasticText01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor } = config;
  const lay = alignLayout(config.align);
  const words = useMemo<ElasticLetter[][]>(
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

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor, minHeight: "100%", containerType: "size", ...lay.outer, ...(typoVars(config) as React.CSSProperties) }}
    >
      <div
        className="flex flex-col justify-center"
        style={lay.block}
        aria-label={text}
      >
        {words.map((word, wi) => (
          <div key={`w-${wi}`} className="flex" style={lay.row}>
            {word.map(({ char, pop }, ci) => (
              <span
                key={`l-${wi}-${ci}`}
                className="inline-block overflow-visible align-bottom"
              >
                {char === " " ? (
                  <span className="inline-block" style={{ fontSize: "calc(11.4cqmin * var(--mg-fs))", lineHeight: "calc(1.2 * var(--mg-lh))", letterSpacing: "var(--mg-ls)", wordSpacing: "var(--mg-ws)" }}>&nbsp;</span>
                ) : (
                  <span
                    data-elastic-letter
                    className="inline-block will-change-transform"
                    style={{
                      color: pop ? accentColor : primaryColor,
                      fontSize: "calc(11.4cqmin * var(--mg-fs))",
                      fontWeight: 800,
                      letterSpacing: "calc(0.04em + var(--mg-ls))",
                      wordSpacing: "var(--mg-ws)",
                      lineHeight: "calc(1.2 * var(--mg-lh))",
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

export default function ElasticText01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildElasticText(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <ElasticText01Frame config={config} />
    </div>
  );
}