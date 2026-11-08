"use client";

import { useEffect, useRef, type ComponentType } from "react";
import gsap from "gsap";
import type { AnimationConfig, ComponentKey } from "@/types/animation";
import type { AnimationComponentProps } from "@/types/animation";
import { ANIMATION_BUILDERS, type AnimationBuilder } from "@/lib/animations/builders";
import { baseEngineKeyOf } from "@/lib/studio/project-model";
import { getStudioTemplate, isStudioTemplateKey } from "@/lib/studio/template-registry";
import { timelineTimeFor } from "@/lib/studio/timing";
import type { ElementTiming } from "@/lib/studio/project-model";
import { fontCss } from "@/lib/brand/fonts";
import SandboxTimelineFrame from "./sandbox-frame";
import { KineticTypography01Frame } from "@/components/animations/KineticTypography01";
import { Typewriter01Frame } from "@/components/animations/Typewriter01";
import { TextReveal01Frame } from "@/components/animations/TextReveal01";
import { ElasticText01Frame } from "@/components/animations/ElasticText01";
import { ShapeMorph01Frame } from "@/components/animations/ShapeMorph01";
import { StaggeredCards01Frame } from "@/components/animations/StaggeredCards01";
import { LogoReveal01Frame } from "@/components/animations/LogoReveal01";
import MinimalSaaSUIShowcase01 from "@/components/animations/MinimalSaaSUIShowcase01";

const STUDIO_FRAMES: Record<ComponentKey, ComponentType<AnimationComponentProps>> = {
  "kinetic-type-01": KineticTypography01Frame,
  "text-reveal-01": TextReveal01Frame,
  "typewriter-01": Typewriter01Frame,
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
  elementDuration,
  timing,
  preview = false,
  renderStage = false,
}: {
  templateKey: ComponentKey;
  config: AnimationConfig;
  /** Temps local (depuis le début de l'élément), en secondes. */
  localTime: number;
  /** Durée de l'élément dans la timeline (requis pour le timing « fit »). */
  elementDuration?: number;
  timing?: ElementTiming;
  /** Vignette (bibliothèque) : pas un calque du projet. */
  preview?: boolean;
  /** Côté rendu MP4 : pas d'overlay (sinon la capture l'inclut). */
  renderStage?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // Dernières valeurs de lecture : une timeline reconstruite (texte, police…)
  // se repositionne immédiatement au bon instant au lieu de rester à 0.
  const playbackRef = useRef({ localTime, elementDuration, timing, speed: config.speed });
  useEffect(() => {
    playbackRef.current = { localTime, elementDuration, timing, speed: config.speed };
  });

  // Clé de moteurs : template intégré OU template custom (via composant de base).
  const studioMeta = getStudioTemplate(templateKey);
  const sandboxCode = studioMeta && "sandboxCode" in studioMeta ? (studioMeta as { sandboxCode?: string }).sandboxCode : undefined;
  const engineKey = isStudioTemplateKey(templateKey) ? baseEngineKeyOf(templateKey) : templateKey;
  const builder: AnimationBuilder | undefined = ANIMATION_BUILDERS[engineKey] ?? ANIMATION_BUILDERS[templateKey];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !builder) return;

    const ctx = gsap.context(() => {
      const built = builder(root, config) ?? undefined;
      if (built) {
        built.repeat(0).repeatDelay(0);
        const p = playbackRef.current;
        built.pause(
          timelineTimeFor(p.localTime, {
            total: built.duration(),
            outAt: built.labels.out,
            elementDuration: p.elementDuration ?? built.duration(),
            timing: p.timing,
            speed: p.speed,
          })
        );
        timelineRef.current = built;
      }
    }, root);

    return () => {
      ctx.revert();
      timelineRef.current = null;
    };
    // Reconstruit aussi quand la police ou le logo changent (le DOM mesuré change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, templateKey, config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.fontFamily, config.logoUrl]);

  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    const target = timelineTimeFor(localTime, {
      total: tl.duration(),
      outAt: tl.labels.out,
      elementDuration: elementDuration ?? tl.duration(),
      timing,
      speed: config.speed,
    });
    tl.pause(target);
  }, [localTime, config.speed, elementDuration, timing]);

  const Frame = STUDIO_FRAMES[engineKey as ComponentKey] ?? STUDIO_FRAMES[templateKey];

  if (!builder || !Frame) {
    if (sandboxCode) {
      // Templates « code » : le moteur du Studio est maître du temps via le
      // contrat déterministe (SEEK) ; le code est servi par /sandbox/<id>
      // (CSP par en-tête HTTP).
      const sandboxMeta = studioMeta as
        | {
            sandboxCode?: string;
            timeDriven?: boolean;
            timelineDuration?: number;
            version?: number;
            sandboxVersion?: number;
            sandboxContract?: { duration: number; outAt?: number };
          }
        | null;
      const total = sandboxMeta?.sandboxContract?.duration ?? sandboxMeta?.timelineDuration ?? elementDuration ?? config.duration;
      return (
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ backgroundColor: config.backgroundColor, fontFamily: fontCss(config.fontFamily) }}
          data-mgsi-element={preview ? undefined : ""}
        >
          <SandboxTimelineFrame
            preview={preview}
            hideOverlay={renderStage}
            /* STUDIO/RENDU : mode doc (srcdoc) — les iframes opaques servies
             * par URL sont ÉTRANGLÉES par Chromium (acks ~2.5 s) ; en srcdoc
             * les acks sont immédiats et la CSP reste réelle (via <meta>). */
            code={(sandboxCode ?? "") + ""}
            params={config as import("@/components/studio/sandbox-frame").SandboxParams}
            time={timelineTimeFor(localTime, {
              total,
              outAt: sandboxMeta?.sandboxContract?.outAt,
              elementDuration: elementDuration ?? config.duration,
              timing,
              speed: 1,
            })}
            compatible={sandboxMeta?.timeDriven ?? false}
          />
        </div>
      );
    }
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
      style={{ backgroundColor: config.backgroundColor, fontFamily: fontCss(config.fontFamily) }}
      data-mgsi-element={preview ? undefined : ""}
    >
      <Frame config={config} />
    </div>
  );
}
/** Liste des cadres DOM (contrôle automatique des templates, /dev/template-check). */
export { STUDIO_FRAMES };
