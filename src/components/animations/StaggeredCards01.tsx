"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";

/**
 * Staggered Cards — apparition progressive de cartes en cascade,
 * avec rebond léger (back.out) et sortie inversée en boucle.
 */
export default function StaggeredCards01({
  config: { text, primaryColor, accentColor, backgroundColor, duration, speed },
}: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) => {
      const cards = root.querySelectorAll<HTMLElement>("[data-card]");
      if (!cards.length) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
      tl.from(cards, {
        y: 44,
        opacity: 0,
        rotation: -6,
        duration: Math.max(0.55, duration * 0.16),
        ease: "back.out(1.7)",
        stagger: 0.16,
      });
      tl.from(root.querySelectorAll<HTMLElement>("[data-card-bar]"), {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.08,
      });
      tl.to(cards, {
        y: -36,
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
        stagger: { each: 0.09, from: "end" },
        delay: Math.max(0.7, duration * 0.34),
      });
      return tl;
    },
  });

  const cardStyle = {
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 18px 44px -22px rgba(0,0,0,0.65)",
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden p-6"
      style={{ backgroundColor }}
    >
      {text ? (
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: accentColor }}
        >
          {text}
        </span>
      ) : null}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-card
            className="flex h-[38%] min-h-16 w-16 flex-col gap-2 rounded-xl p-3 will-change-transform sm:h-24 sm:w-20"
            style={{ ...cardStyle, backgroundColor: i === 1 ? "rgba(255,255,255,0.08)" : undefined, aspectRatio: "0.82", height: "auto" }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: i === 1 ? accentColor : "rgba(255,255,255,0.35)" }}
            />
            <span
              className="flex min-h-1.5 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.4)", flexGrow: 0, width: "85%", height: "6%" }}
            />
            <div data-card-bar className="flex flex-col gap-1 pt-1">
              <span className="block h-1 w-4/5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.22)" }} />
              <span className="block h-1 w-3/5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.16)" }} />
              <span className="block h-1 w-2/5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.16)" }} />
            </div>
            <span
              className="mt-auto block h-1.5 w-1/2 rounded-full"
              style={{ backgroundColor: i === 1 ? accentColor : "rgba(255,255,255,0.3)", opacity: 0.8 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}