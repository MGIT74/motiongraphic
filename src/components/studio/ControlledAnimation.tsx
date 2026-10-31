"use client";

import { useEffect, useRef, type ComponentType } from "react";
import gsap from "gsap";
import type { AnimationConfig, ComponentKey } from "@/types/animation";
import type { AnimationComponentProps } from "@/types/animation";
import { ANIMATION_BUILDERS, type AnimationBuilder } from "@/lib/animations/builders";
import { baseEngineKeyOf } from "@/lib/studio/project-model";
import { isStudioTemplateKey } from "@/lib/studio/template-registry";
import { KineticTypography01Frame } from "@/components/animations/KineticTypography01";
import { TextReveal01Frame } from "@/components/animations/TextReveal01";
import { ElasticText01Frame } from "@/components/animations/ElasticText01";
import { ShapeMorph01Frame } from "@/components/animations/ShapeMorph01";
import { StaggeredCards01Frame } from "@/components/animations/StaggeredCards01";
import { LogoReveal01Frame } from "@/components/animations/LogoReveal01";
import MinimalSaaSUIShowcase01 from "@/components/animations/MinimalSaaSUIShowcase01";

const STUDIO_FRAMES: Record<ComponentKey, ComponentType<AnimationComponentProps>> = {
  "kinetic-type-01": KineticTypography01Frame,
  "text-reveal-01": TextReveal01Frame,
  "elastic-text-01": ElasticText01Frame,
  "shape-morph-01": ShapeMorph01Frame,
  "staggered-cards-01": StaggeredCards01Frame,
// minimal-saas-ui-01 est auto-anime (interactions) : pilote par builder en Phase 2.
  "minimal-saas-ui-01": MinimalSaaSUIShowcase01,
  "logo-reveal-01": LogoReveal01Frame,
};

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

  // Clé de moteurs : template intégré OU template custom (via composant de base).
  const engineKey = isStudioTemplateKey(templateKey) ? baseEngineKeyOf(templateKey) : templateKey;
  const builder: AnimationBuilder | undefined = ANIMATION_BUILDERS[engineKey] ?? ANIMATION_BUILDERS[templateKey];

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

  const Frame = STUDIO_FRAMES[engineKey as ComponentKey] ?? STUDIO_FRAMES[templateKey];

  if (!builder || !Frame) {
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
    >
      <Frame config={config} />
    </div>
  );
}