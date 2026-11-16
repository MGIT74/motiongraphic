import type { AnimationConfig } from "@/types/animation";

/** Une lettre affichée et sa position dans `config.text` (clé de `charColors`). */
export interface IndexedChar {
  char: string;
  index: number;
}

/**
 * Lignes du texte (majuscules, lignes vides ignorées) avec, pour chaque lettre,
 * sa position dans le texte d'origine : c'est cette position qui porte la couleur.
 */
export function indexedLines(text: string): IndexedChar[][] {
  const lines: IndexedChar[][] = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    if (raw.length > 0) {
      const up = raw.toUpperCase();
      // toUpperCase garde la longueur pour le français ; sinon on retombe sur l'original.
      const src = up.length === raw.length ? up : raw;
      lines.push(Array.from({ length: raw.length }, (_, i) => ({ char: src[i], index: offset + i })));
    }
    offset += raw.length + 1;
  }
  return lines;
}

/**
 * Couleur d'une lettre. Avec `charColors` (même vide), seule la sélection de
 * l'utilisateur colore ; sans, on garde l'ancien rendu du template (lettres d'accent).
 */
export function letterColor(config: AnimationConfig, index: number, legacyAccent: boolean): string {
  if (config.charColors) return config.charColors[String(index)] ?? config.primaryColor;
  return legacyAccent ? config.accentColor : config.primaryColor;
}

/** Recale les couleurs quand le texte change (préfixe / suffixe communs conservés). */
export function remapCharColors(
  before: string,
  after: string,
  colors: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!colors) return colors;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const delta = after.length - before.length;
  const next: Record<string, string> = {};
  for (const [k, c] of Object.entries(colors)) {
    const i = Number(k);
    if (i < p) next[k] = c;
    else if (i >= before.length - s) next[String(i + delta)] = c;
    // lettres remplacées ou supprimées : leur couleur disparaît
  }
  return next;
}

/** Applique une couleur à la plage [from, to] ; `null` = couleur du texte. */
export function paintRange(
  config: AnimationConfig,
  from: number,
  to: number,
  color: string | null,
  legacyAccentAt?: (index: number) => boolean
): Record<string, string> {
  // Premier réglage : on fige l'ancien rendu pour que rien ne change ailleurs.
  const base: Record<string, string> = config.charColors ? { ...config.charColors } : {};
  if (!config.charColors && legacyAccentAt) {
    for (let i = 0; i < config.text.length; i++) if (legacyAccentAt(i)) base[String(i)] = config.accentColor;
  }
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    if (config.text[i] === "\n" || config.text[i] === " ") continue;
    if (color === null || color.toLowerCase() === config.primaryColor.toLowerCase()) delete base[String(i)];
    else base[String(i)] = color;
  }
  return base;
}
