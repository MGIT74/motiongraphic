import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { getComponentMeta } from "@/lib/animations/registry";
import { isBrandFont } from "@/lib/brand/fonts";

/** Logo importé : data URL image uniquement (rendue via <image>, jamais exécutée). */
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 400_000;

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
    ...(isBrandFont(raw.fontFamily) ? { fontFamily: raw.fontFamily as string } : fallback.fontFamily ? { fontFamily: fallback.fontFamily } : {}),
    ...numField("fontSize", raw.fontSize, fallback.fontSize, 0.3, 3),
    ...numField("lineHeight", raw.lineHeight, fallback.lineHeight, 0.6, 2.5),
    ...numField("letterSpacing", raw.letterSpacing, fallback.letterSpacing, -0.1, 0.6),
    ...numField("wordSpacing", raw.wordSpacing, fallback.wordSpacing, -0.2, 1.5),
    ...(isAlign(raw.align) ? { align: raw.align as TextAlign } : fallback.align ? { align: fallback.align } : {}),
    ...(isSafeLogoUrl(raw.logoUrl) ? { logoUrl: raw.logoUrl as string } : {}),
  };
}

function numField(key: string, v: unknown, fb: number | undefined, min: number, max: number): Record<string, number> {
  const n = typeof v === "number" ? v : v === undefined || v === null || v === "" ? NaN : Number(v);
  if (Number.isFinite(n)) return { [key]: Math.min(max, Math.max(min, n)) };
  return fb !== undefined ? { [key]: fb } : {};
}

/** Variables CSS de typographie (taille, interligne, espacements) lues par les templates texte. */
export function typoVars(config: AnimationConfig): Record<string, string> {
  return {
    "--mg-fs": String(config.fontSize ?? 1),
    "--mg-lh": String(config.lineHeight ?? 1),
    "--mg-ls": `${config.letterSpacing ?? 0}em`,
    "--mg-ws": `${config.wordSpacing ?? 0}em`,
  };
}

export type TextAlign = "left" | "center" | "right" | "justify";
export const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right", "justify"];
function isAlign(v: unknown): v is TextAlign {
  return typeof v === "string" && (TEXT_ALIGNS as string[]).includes(v);
}

/** Styles flex communs aux templates texte pour gérer l'alignement. */
export function alignLayout(align?: TextAlign) {
  const a = align ?? "center";
  const flex = a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center";
  return {
    /** Conteneur plein cadre (position horizontale du bloc). */
    outer: { justifyContent: a === "justify" ? "stretch" : flex } as const,
    /** Bloc de texte (largeur pleine si justifié). */
    block: { alignItems: a === "justify" ? "stretch" : flex, width: a === "justify" ? "100%" : undefined, textAlign: a === "justify" ? "center" : a } as const,
    /** Ligne de lettres. */
    row: { justifyContent: a === "justify" ? "space-between" : flex } as const,
  };
}

export { isSafeColor };

export function sanitizeConfigByKey(key: ComponentKey, input: unknown): AnimationConfig {
  return sanitizeConfig(input, getComponentMeta(key).defaultConfig);
}