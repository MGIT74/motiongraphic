import type { ElementTiming } from "./project-model";

/**
 * Convertit le temps local d'un élément (secondes depuis son début) en temps
 * de sa timeline GSAP, selon le mode de timing :
 * - natural : lecture à la vitesse de l'animation (coupée à la fin de l'élément) ;
 * - fit     : entrée, maintien, puis sortie qui se termine pile à la fin ;
 * - hold    : entrée puis maintien figé, sans sortie.
 * `outAt` = position du label « out » (début de sortie) ; absent → natural.
 */
export function timelineTimeFor(
  localTime: number,
  opts: { total: number; outAt?: number; elementDuration: number; timing?: ElementTiming; speed?: number }
): number {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const total = Math.max(0, opts.total);
  const t = Math.max(0, localTime);
  const clamp = (v: number) => Math.max(0, Math.min(total, v));
  const timing = opts.timing ?? "natural";
  const outAt = opts.outAt;

  if (timing === "natural" || outAt === undefined || !Number.isFinite(outAt) || outAt <= 0 || outAt >= total) {
    return clamp(t * speed);
  }
  if (timing === "hold") return Math.min(t * speed, outAt);

  // fit
  const introLen = outAt / speed;
  const exitLen = (total - outAt) / speed;
  const D = Math.max(0, opts.elementDuration);
  if (introLen + exitLen > D) {
    // Élément plus court que l'entrée + la sortie : on compresse toute l'animation.
    return D > 0 ? clamp((t / D) * total) : total;
  }
  const exitStart = D - exitLen;
  if (t < exitStart) return Math.min(t * speed, outAt);
  return clamp(outAt + (t - exitStart) * speed);
}
