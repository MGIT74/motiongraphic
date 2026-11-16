"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import LetterColors from "./LetterColors";
import { remapCharColors } from "@/lib/animations/char-colors";
import type { StudioElement } from "@/lib/studio/project-model";

/**
 * Édition directe sur la scène (double-clic sur un texte) : modifier le texte
 * et colorer des lettres choisies, sans passer par le panneau de droite.
 */
export default function CanvasTextEditor({
  element,
  anchor,
  onPatch,
  onClose,
}: {
  element: StudioElement;
  /** Coin bas-gauche de la boîte de sélection, en px écran. */
  anchor: { x: number; y: number; top: number };
  onPatch: (patch: Partial<StudioElement>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const config = element.config;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  // Sous la sélection ; au-dessus si la place manque en bas de l'écran.
  const width = 340;
  const below = typeof window === "undefined" || anchor.y + 260 < window.innerHeight;
  const left = typeof window === "undefined" ? anchor.x : Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));

  // Portail : la scène (container query) piégerait un élément « fixed ».
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[200] flex flex-col gap-2 rounded-xl border border-line bg-surface/95 p-3 shadow-2xl backdrop-blur"
      style={{ width, left, ...(below ? { top: anchor.y + 10 } : { bottom: window.innerHeight - anchor.top + 10 }) }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Modifier le texte</p>
        <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-muted hover:text-ink" aria-label="Fermer">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <input
        autoFocus
        value={config.text}
        onChange={(e) => {
          const text = e.target.value.slice(0, 120);
          onPatch({ config: { ...config, text, charColors: remapCharColors(config.text, text, config.charColors) } });
        }}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        className="h-9 w-full rounded-lg border border-line bg-background px-2.5 text-sm text-ink focus:border-accent/60 focus:outline-none"
        aria-label="Texte"
      />
      <LetterColors big templateKey={element.templateKey} config={config} onChange={(charColors) => onPatch({ config: { ...config, charColors } })} />
    </div>,
    document.body
  );
}
