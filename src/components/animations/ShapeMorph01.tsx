"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";

/** Formes à 8 sommets (interpolation clip-path fluide). */
const SHAPES = {
  square: "0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%",
  octagon: "29% 0%, 71% 0%, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0% 71%, 0% 29%",
  star: "50% 4%, 62.7% 37.3%, 96% 50%, 62.7% 62.7%, 50% 96%, 37.3% 62.7%, 4% 50%, 37.3% 37.3%",
};

/**
 * Shape Morph — une forme géométrique se transforme continûment
 * (carré, octogone, étoile) via l'interpolation de clip-path.
 */
export default function ShapeMorph01({
  config: { text, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [text, accentColor, duration, speed],
    speed,
    build: (root) => {
      const morph = root.querySelector<HTMLElement>("[data-morph]");
      const halo = root.querySelector<HTMLElement>("[data-halo]");
      if (!morph) return;

      const seg = duration / 3;
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
      tl.to(morph, { clipPath: SHAPES.octagon, duration: seg, ease: "sine.inOut" })
        .to(morph, { clipPath: SHAPES.star, duration: seg, ease: "sine.inOut" })
        .to(morph, { clipPath: SHAPES.square, duration: seg, ease: "sine.inOut" });
      if (halo) {
        tl.fromTo(
          halo,
          { scale: 1, opacity: 0.55 },
          { scale: 1.18, opacity: 0.15, duration: seg * 1.2, ease: "sine.inOut", yoyo: true, repeat: 2 },
          0
        );
      }
      tl.to(morph, { rotation: 360, duration: seg * 3, ease: "none" }, 0);
      return tl;
    },
  });

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundColor }}
    >
      <div className="relative flex h-2/5 w-auto max-w-[70%] items-center justify-center" style={{ aspectRatio: "1" }}>
        <div
          data-halo
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: accentColor,
            filter: "blur(38px)",
            opacity: 0.4,
          }}
        />
        <div
          data-morph
          className="relative h-full w-full will-change-transform"
          style={{
            clipPath: SHAPES.square,
            background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}88 55%, transparent 120%)`,
          }}
        />
      </div>
      {text ? (
        <span
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-[0.35em]"
          style={{ color: accentColor, opacity: 0.75 }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}