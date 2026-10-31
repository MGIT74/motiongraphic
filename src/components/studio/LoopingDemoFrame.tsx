"use client";

import type { AnimationComponentProps, ComponentKey } from "@/types/animation";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import { ANIMATION_BUILDERS } from "@/lib/animations/builders";
import { KineticTypography01Frame } from "@/components/animations/KineticTypography01";
import { TextReveal01Frame } from "@/components/animations/TextReveal01";
import { ElasticText01Frame } from "@/components/animations/ElasticText01";
import { ShapeMorph01Frame } from "@/components/animations/ShapeMorph01";
import { StaggeredCards01Frame } from "@/components/animations/StaggeredCards01";
import { LogoReveal01Frame } from "@/components/animations/LogoReveal01";
import MinimalSaaSUIShowcase01 from "@/components/animations/MinimalSaaSUIShowcase01";
import type { ComponentType } from "react";

const DEMO_FRAMES: Record<ComponentKey, ComponentType<AnimationComponentProps>> = {
  "kinetic-type-01": KineticTypography01Frame,
  "text-reveal-01": TextReveal01Frame,
  "elastic-text-01": ElasticText01Frame,
  "shape-morph-01": ShapeMorph01Frame,
  "staggered-cards-01": StaggeredCards01Frame,
// Auto-anime (interactions utilisateur) - synchronisation timeline en Phase 2.
  "minimal-saas-ui-01": MinimalSaaSUIShowcase01,
  "logo-reveal-01": LogoReveal01Frame,
};

/**
 * Aperçu miniature en boucle d'un template (bibliothèque du Studio).
 * Construit la timeline avec `loop: true` et la laisse jouer — montée
 * uniquement dans le panneau des styles compatibles (3-6 instances max).
 */
export default function LoopingDemoFrame({ templateKey, config }: AnimationComponentProps & { templateKey: ComponentKey }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const builder = ANIMATION_BUILDERS[templateKey];
    if (!root || !builder) return;

    const ctx = gsap.context(() => {
      builder(root, config, { loop: true });
    }, root);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration]);

  const Frame = DEMO_FRAMES[templateKey];
  if (!Frame) return null;

  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: config.backgroundColor }}>
      <Frame config={config} />
    </div>
  );
}