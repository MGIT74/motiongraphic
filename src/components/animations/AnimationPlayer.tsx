"use client";

import dynamic from "next/dynamic";
import type { AnimationComponentProps, AnimationConfig, ComponentKey } from "@/types/animation";

/**
 * Mapping `component_key` -> composant React. Chaque composant d'animation est
 * un module indépendant chargé en différé. Le futur Motion Studio pourra
 * ajouter un moteur d'édition en passant `config` modifié à ces mêmes
 * composants, sans réécrire le moteur.
 */
const ANIMATION_COMPONENTS: Record<
  ComponentKey,
  React.ComponentType<AnimationComponentProps>
> = {
  "kinetic-type-01": dynamic(() => import("@/components/animations/KineticTypography01")),
  "text-reveal-01": dynamic(() => import("@/components/animations/TextReveal01")),
  "elastic-text-01": dynamic(() => import("@/components/animations/ElasticText01")),
  "shape-morph-01": dynamic(() => import("@/components/animations/ShapeMorph01")),
  "staggered-cards-01": dynamic(() => import("@/components/animations/StaggeredCards01")),
  "logo-reveal-01": dynamic(() => import("@/components/animations/LogoReveal01")),
  "minimal-saas-ui-01": dynamic(() => import("@/components/animations/MinimalSaaSUIShowcase01")),
};

function PlayerPlaceholder({ active, backgroundColor }: { active: boolean; backgroundColor: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor }}
      aria-hidden="true"
    >
      {!active && (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/30" />
      )}
    </div>
  );
}

export interface AnimationPlayerProps {
  componentKey: ComponentKey;
  config: AnimationConfig;
  /** Classes du cadre (ratio d'aspect, arrondis…) */
  className?: string;
  /** Ne monte le composant que lorsque l'élément est proche du viewport. */
  active?: boolean;
}

export default function AnimationPlayer({
  componentKey,
  config,
  className = "",
  active = true,
}: AnimationPlayerProps) {
  const Animation = ANIMATION_COMPONENTS[componentKey];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {Animation && active ? (
        <Animation config={config} />
      ) : (
        <PlayerPlaceholder active={active} backgroundColor={config.backgroundColor} />
      )}
    </div>
  );
}