"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Tiroir des styles (fx) : s'ouvre et se referme en douceur (hauteur + fondu)
 * au lieu d'apparaître d'un coup. Le contenu (aperçus animés, coûteux) n'est
 * monté que pendant l'ouverture et l'animation de fermeture.
 */
export default function FxDrawer({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!open) {
      const raf = requestAnimationFrame(() => setShown(false));
      // Démonte après l'animation (même sans transitionend, ex. animations réduites).
      const timer = setTimeout(() => setMounted(false), 340);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
    // Deux images : le tiroir est d'abord peint fermé, puis la transition s'ouvre.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className="grid shrink-0 overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? "1fr" : "0fr", opacity: shown ? 1 : 0 }}
    >
      <div className={`min-h-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${shown ? "translate-y-0" : "translate-y-3"}`}>{children}</div>
    </div>
  );
}
