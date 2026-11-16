import { remapCharColors } from "@/lib/animations/char-colors";
import type { AnimationConfig } from "@/types/animation";

/** Édition du texte directement sur la scène : curseur / sélection (positions dans `config.text`). */
export interface TextEditState {
  id: string;
  /** Début de la sélection (où le clic a commencé). */
  anchor: number;
  /** Fin de la sélection = position du curseur. */
  focus: number;
}

export const MAX_TEXT = 120;

export function selRange(t: Pick<TextEditState, "anchor" | "focus">): [number, number] {
  return [Math.min(t.anchor, t.focus), Math.max(t.anchor, t.focus)];
}

/** Remplace la sélection par `insert` ; les nouvelles lettres prennent la couleur de celle qui précède. */
export function replaceSelection(config: AnimationConfig, edit: TextEditState, insert: string): { config: AnimationConfig; caret: number } {
  const [a, b] = selRange(edit);
  const room = MAX_TEXT - (config.text.length - (b - a));
  const add = insert.slice(0, Math.max(0, room));
  const text = config.text.slice(0, a) + add + config.text.slice(b);
  let charColors = remapCharColors(config.text, text, config.charColors);
  const inherit = a > 0 ? config.charColors?.[String(a - 1)] : undefined;
  if (charColors && inherit) {
    charColors = { ...charColors };
    for (let i = 0; i < add.length; i++) if (add[i] !== " " && add[i] !== "\n") charColors[String(a + i)] = inherit;
  }
  return { config: { ...config, text, ...(charColors ? { charColors } : {}) }, caret: a + add.length };
}

/** Bornes du mot autour de `index` (double-clic). */
export function wordAt(text: string, index: number): [number, number] {
  const isWord = (c: string | undefined) => !!c && !/[\s.,;:!?…«»"'()]/.test(c);
  let a = Math.max(0, Math.min(index, text.length - 1));
  if (!isWord(text[a])) return [a, Math.min(text.length, a + 1)];
  let b = a;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  return [a, b];
}
