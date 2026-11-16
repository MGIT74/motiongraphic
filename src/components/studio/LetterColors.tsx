"use client";

import { useState } from "react";
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
 * Sélecteur de lettres façon éditeur : on glisse sur les lettres pour les
 * sélectionner, puis on choisit une couleur (pastille ou nuancier).
 */
export default function LetterColors({
  templateKey,
  config,
  onChange,
  big = false,
}: {
  templateKey: string;
  config: AnimationConfig;
  onChange: (charColors: Record<string, string>) => void;
  big?: boolean;
}) {
  const [range, setRange] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const lines = indexedLines(config.text);
  const legacy = legacyAccentAt(templateKey, config.text);
  const colorOf = (i: number) =>
    config.charColors ? (config.charColors[String(i)] ?? config.primaryColor) : legacy?.(i) ? config.accentColor : config.primaryColor;
  const inRange = (i: number) => range !== null && i >= Math.min(...range) && i <= Math.max(...range);
  const apply = (color: string | null) => {
    const [a, b] = range ?? [0, config.text.length - 1];
    onChange(paintRange(config, a, b, color, legacy));
  };

  return (
    <div className="flex flex-col gap-2" onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
      <div
        className={`select-none rounded-lg border border-line bg-[#111114] px-2 py-2 font-bold leading-tight tracking-wide ${big ? "text-2xl" : "text-sm"}`}
        style={{ touchAction: "none" }}
      >
        {lines.map((line, li) => (
          <div key={li} className="flex flex-wrap">
            {line.map(({ char, index }) => (
              <span
                key={index}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(true);
                  setRange(e.shiftKey && range ? [range[0], index] : [index, index]);
                }}
                onPointerEnter={() => dragging && setRange((r) => (r ? [r[0], index] : [index, index]))}
                className={`cursor-text rounded-[3px] ${inRange(index) ? "bg-accent/40 ring-1 ring-accent" : ""}`}
                style={{ color: colorOf(index) }}
              >
                {char === " " ? " " : char}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        {range ? `${Math.abs(range[1] - range[0]) + 1} lettre(s) sélectionnée(s)` : "Glissez sur des lettres pour les sélectionner (sinon : tout le texte)."}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {LETTER_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
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
