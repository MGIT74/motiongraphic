"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildLogoReveal } from "@/lib/animations/builders";

/**
 * Logo Reveal — logo abstrait (SVG) : tracé du cercle par la lumière,
 * halo pulsé, monogramme géométrique, mot-symbole révélé.
 *
 * `LogoReveal01Frame` = DOM pur (réutilisé tel quel par le Studio).
 */
export function LogoReveal01Frame({ config }: AnimationComponentProps) {
  const { text, accentColor, backgroundColor, logoUrl } = config;

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-6"
      style={{ backgroundColor, minHeight: "100%", containerType: "size", gap: "2.8cqmin" }}
    >
      <svg viewBox="0 0 120 120" className="w-auto" aria-hidden="true" style={{ overflow: "visible", height: "23cqmin" }}>
        <title>{logoUrl ? "Logo" : "Logo abstrait"}</title>
        <circle data-pulse cx="60" cy="60" r="40" fill="none" stroke={accentColor} strokeWidth="1.5" opacity="0.5" />
        <circle data-ring cx="60" cy="60" r="46" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
        {logoUrl ? (
          // Logo importé (data URL image, validée par sanitizeConfig) : rendu
          // comme image, jamais exécuté. Animé comme le cœur du logo abstrait.
          <image data-core href={logoUrl} x="30" y="30" width="60" height="60" preserveAspectRatio="xMidYMid meet" />
        ) : (
          <>
            <polygon data-core points="60,34 82,72 38,72" fill={accentColor} opacity="0.92" />
            <polygon points="60,52 74,68 60,84 46,68" fill="#000000" opacity="0.55" />
          </>
        )}
      </svg>
      {text ? (
        <span
          data-wordmark
          className="font-bold uppercase"
          style={{ color: accentColor, fontSize: "2.6cqmin" }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}

export default function LogoReveal01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildLogoReveal(root, { text, primaryColor, accentColor, backgroundColor, duration, speed }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <LogoReveal01Frame config={config} />
    </div>
  );
}