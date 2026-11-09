"use client";

import { useMemo } from "react";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildKineticTypographyPro } from "@/lib/animations/kinetic-typography-pro";

const MAX_CHARS = 34;
export function KineticTypographyPro01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor } = config;
  const lines = useMemo(() => (text.trim() || "MAKE IT\nMOVE").toUpperCase().split("\n").slice(0, 3).map(line => Array.from(line.slice(0, MAX_CHARS))), [text]);
  const longest = Math.max(1, ...lines.map(line => line.length));
  const size = Math.min(17, 165 / Math.max(8, longest));
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={{ backgroundColor, containerType: "size", minHeight: "100%" }}>
      <div className="absolute left-[7%] top-[9%] h-px w-[86%] opacity-20" style={{ backgroundColor: primaryColor }} />
      <div className="absolute left-[7%] top-[12%] text-[2.1cqmin] font-semibold uppercase tracking-[0.28em] opacity-60" style={{ color: primaryColor }}>MOTION / TYPE 01</div>
      <div className="relative flex w-[88%] flex-col items-center justify-center" aria-label={text}>
        {lines.map((line, index) => (
          <div key={index} className="flex max-w-full items-center justify-center whitespace-nowrap" style={{ lineHeight: 1.03 }}>
            {line.map((char, i) => (
              <span key={i} className="inline-block overflow-hidden" style={{ paddingBottom: "0.11em", paddingTop: "0.07em" }}>
                <span data-pro-letter className="inline-block will-change-transform" style={{
                  color: index === 1 ? accentColor : primaryColor,
                  fontSize: `${size}cqmin`, fontWeight: 850, letterSpacing: "-0.055em", lineHeight: 1.04,
                }}>{char === " " ? "\u00a0" : char}</span>
              </span>
            ))}
          </div>
        ))}
        <div data-pro-rule className="mt-[3cqmin] h-[0.5cqmin] w-[18cqmin] origin-left rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
      <div className="absolute bottom-[9%] right-[7%] text-[2cqmin] font-medium tracking-[0.22em] opacity-60" style={{ color: primaryColor }}>CREATIVE IN MOTION</div>
    </div>
  );
}

export default function KineticTypographyPro01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed],
    speed: config.speed,
    build: root => buildKineticTypographyPro(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><KineticTypographyPro01Frame config={config} /></div>;
}
