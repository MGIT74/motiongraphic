import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { getComponentMeta } from "@/lib/animations/registry";

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
  const text = typeof raw.text === "string" ? raw.text.slice(0, 120) : fallback.text;
  return {
    text,
    primaryColor: isSafeColor(raw.primaryColor) ? (raw.primaryColor as string) : fallback.primaryColor,
    accentColor: isSafeColor(raw.accentColor) ? (raw.accentColor as string) : fallback.accentColor,
    backgroundColor: isSafeColor(raw.backgroundColor)
      ? (raw.backgroundColor as string)
      : fallback.backgroundColor,
    duration: clamp(raw.duration, 1, 30, fallback.duration),
    speed: clamp(raw.speed, 0.25, 3, fallback.speed),
  };
}

export function sanitizeConfigByKey(key: ComponentKey, input: unknown): AnimationConfig {
  return sanitizeConfig(input, getComponentMeta(key).defaultConfig);
}