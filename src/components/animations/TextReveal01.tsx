"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { alignLayout, typoVars } from "@/lib/animations/config";
import { useAnimationEngine } from "./engine";
import { buildTextReveal } from "@/lib/animations/builders";

/**
 * Text Reveal — révélation du texte par masque vertical, ligne par ligne,
 * avec un balayage lumineux et une sortie douce en boucle.
 *
 * `TextReveal01Frame` = DOM pur (réutilisé tel quel par le Studio).
 */
export function TextReveal01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor } = config;
  const lay = alignLayout(config.align);
  const lines = text.toUpperCase().split("\n").filter(Boolean);

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor, minHeight: "100%", containerType: "size", ...lay.outer, ...(typoVars(config) as React.CSSProperties) }}
    >
      <div className="relative flex flex-col justify-center" style={lay.block}>
        {lines.map((line, i) => (
          <div key={`line-${i}`} className="overflow-hidden py-1" style={{ paddingBottom: "0.12em" }}>
            <span
              data-reveal-line
              className="block will-change-transform"
              style={{
                color: primaryColor,
                ...(config.align === "justify" ? { textAlign: "justify" as const, textAlignLast: "justify" as const } : {}),
                fontSize: "calc(10.8cqmin * var(--mg-fs))",
                fontWeight: 750,
                letterSpacing: "calc(0.03em + var(--mg-ls))",
                wordSpacing: "var(--mg-ws)",
                lineHeight: "calc(1.1 * var(--mg-lh))",
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

export default function TextReveal01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildTextReveal(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <TextReveal01Frame config={config} />
    </div>
  );
}