"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { ANIMATION_BUILDERS, type AnimationBuilder } from "@/lib/animations/builders";

/**
 * Lecteur d'animation piloté par le temps de la timeline Studio.
 *
 * La timeline GSAP est construite une seule fois (loop: false), puis
 * positionnée à `localTime` via `timeline.time()` : navigation précise
 * (scrub), lecture quand le temps avance, gel (hold) au-delà de la fin.
 * Nettoyage GSAP garanti au démontage via gsap.context.
 */
export default function ControlledAnimation({
  templateKey,
  config,
  localTime,
}: {
  templateKey: ComponentKey;
  config: AnimationConfig;
  /** Temps local (depuis le début de l'élément), en secondes. */
  localTime: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const builder: AnimationBuilder | undefined = ANIMATION_BUILDERS[templateKey];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !builder) return;

    const ctx = gsap.context(() => {
      const built = builder(root, config) ?? undefined;
      if (built) {
        built
          .repeat(0)
          .repeatDelay(0)
          .pause(0);
        timelineRef.current = built;
      }
    }, root);

    return () => {
      ctx.revert();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, templateKey, config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration]);

  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    const target = Math.max(0, Math.min(tl.duration(), localTime * (config.speed > 0 ? config.speed : 1)));
    tl.pause(target);
  }, [localTime, config.speed]);

  if (!builder) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-xs text-muted"
        style={{ backgroundColor: config.backgroundColor }}
      >
        Template inconnu : {templateKey}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 h-full w-full overflow-hidden"
      style={{ backgroundColor: config.backgroundColor }}
    />
  );
}