"use client";

import { indexedLines, paintRange } from "@/lib/animations/char-colors";
import { underlyingComponentKeyOf } from "@/lib/studio/template-registry";
import type { AnimationConfig } from "@/types/animation";

/** Templates texte qui savent colorer chaque lettre. */
const LEGACY_ACCENT: Record<string, ((n: number) => boolean) | null> = {
  "kinetic-type-01": (n) => n % 3 === 1,
  "elastic-text-01": (n) => n % 4 === 2,
  "text-reveal-01": null,
};

function baseKey(templateKey: string): string {
  return underlyingComponentKeyOf(templateKey) ?? templateKey;
}

export function supportsLetterColors(templateKey: string): boolean {
  return baseKey(templateKey) in LEGACY_ACCENT;
}

/** Position dans le texte → lettre d'accent de l'ancien rendu (pour figer l'existant). */
function legacyAccentAt(templateKey: string, text: string): ((index: number) => boolean) | undefined {
  const rule = LEGACY_ACCENT[baseKey(templateKey)];
  if (!rule) return undefined;
  const accents = new Set<number>();
  let n = 0;
  for (const line of indexedLines(text)) for (const c of line) if (rule(n++)) accents.add(c.index);
  return (i) => accents.has(i);
}

export const LETTER_SWATCHES = ["#FFFFFF", "#F5F5F7", "#A1A1AA", "#18181B", "#000000", "#FF6B2C", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];

/**
 * Couleur des lettres : s'applique aux lettres sélectionnées directement sur
 * la scène (double-clic sur le texte, puis glisser), sinon à tout le texte.
 */
export default function LetterColors({
  templateKey,
  config,
  range,
  onChange,
}: {
  templateKey: string;
  config: AnimationConfig;
  /** [début, fin[ dans config.text ; null = tout le texte. */
  range: [number, number] | null;
  onChange: (charColors: Record<string, string>) => void;
}) {
  const legacy = legacyAccentAt(templateKey, config.text);
  const apply = (color: string | null) => {
    const [a, b] = range ?? [0, config.text.length];
    if (b <= a) return;
    onChange(paintRange(config, a, b - 1, color, legacy));
  };
  const count = range ? config.text.slice(range[0], range[1]).replace(/\s/g, "").length : 0;

  return (
    <div className="flex flex-col gap-2">
      <p className={`rounded-lg border px-2.5 py-2 text-[11px] ${range ? "border-accent/50 bg-accent/10 text-ink" : "border-line bg-background text-muted"}`}>
        {range
          ? `${count} lettre(s) sélectionnée(s) sur la scène`
          : "Double-cliquez le texte sur la scène et sélectionnez des lettres (sinon : tout le texte)."}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {LETTER_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(c)}
            className="h-6 w-6 cursor-pointer rounded-full border border-line"
            style={{ background: c }}
            aria-label={`Colorer en ${c}`}
            title={c}
          />
        ))}
        <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line" title="Autre couleur">
          <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => apply(e.target.value)} aria-label="Autre couleur" />
        </label>
        <button type="button" onClick={() => apply(null)} className="ml-auto cursor-pointer rounded-md border border-line px-2 py-0.5 text-[10px] text-muted hover:text-ink">
          Couleur du texte
        </button>
      </div>
    </div>
  );
}
