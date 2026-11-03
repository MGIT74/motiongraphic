import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { getComponentMeta } from "@/lib/animations/registry";
import { isBrandFont } from "@/lib/brand/fonts";

/** Logo importé : data URL image uniquement (rendue via <image>, jamais exécutée). */
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 400_000;
/** Texte d'un élément (plusieurs lignes pour les templates à liste, ex. notifications). */
export const TEXT_MAX_CHARS = 800;

export function isSafeLogoUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= LOGO_MAX_CHARS && LOGO_RE.test(value);
}

const HEX_RE = /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgb\(|hsl\(|transparent|black|white)$/;
const NAMED = new Set([
  "transparent",
  "black",
  "white",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "magenta",
]);

function isSafeColor(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  if (NAMED.has(v)) return true;
  if (HEX_RE.test(v)) return true;
  // rgb()/hsl() simples sans caractères dangereux
  return /^(rgba?|hsla?)\([-0-9.,% /]+\)$/.test(v);
}

/**
 * Assainit et normalise une configuration d'animation provenant de données
 * externes (Supabase) avant de la donner au moteur.
 */
export function sanitizeConfig(input: unknown, fallback: AnimationConfig): AnimationConfig {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const clamp = (v: unknown, min: number, max: number, dflt: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  const text = typeof raw.text === "string" ? raw.text.slice(0, TEXT_MAX_CHARS) : fallback.text;
  return {
    text,
    primaryColor: isSafeColor(raw.primaryColor) ? (raw.primaryColor as string) : fallback.primaryColor,
    accentColor: isSafeColor(raw.accentColor) ? (raw.accentColor as string) : fallback.accentColor,
    backgroundColor: isSafeColor(raw.backgroundColor)
      ? (raw.backgroundColor as string)
      : fallback.backgroundColor,
    duration: clamp(raw.duration, 1, 30, fallback.duration),
    speed: clamp(raw.speed, 0.25, 3, fallback.speed),
    ...(isBrandFont(raw.fontFamily) ? { fontFamily: raw.fontFamily as string } : fallback.fontFamily ? { fontFamily: fallback.fontFamily } : {}),
    ...(isSafeLogoUrl(raw.logoUrl) ? { logoUrl: raw.logoUrl as string } : {}),
  };
}

export { isSafeColor };

export function sanitizeConfigByKey(key: ComponentKey, input: unknown): AnimationConfig {
  return sanitizeConfig(input, getComponentMeta(key).defaultConfig);
}