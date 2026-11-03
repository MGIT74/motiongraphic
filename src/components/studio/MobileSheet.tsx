"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Film, Image as ImageIcon, Layers3, Palette, SlidersHorizontal, X } from "lucide-react";

/** Écran étroit (téléphone, tablette en portrait) : disposition mobile du Studio. */
export function useCompactStudio(query = "(max-width: 1023px)"): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export type MobileSheetId = "scenes" | "library" | "media" | "brand" | "properties";

export const MOBILE_TABS: { id: MobileSheetId; label: string; icon: typeof Film }[] = [
  { id: "scenes", label: "Scènes", icon: Layers3 },
  { id: "library", label: "Templates", icon: Film },
  { id: "media", label: "Médias", icon: ImageIcon },
  { id: "brand", label: "Marque", icon: Palette },
  { id: "properties", label: "Modifier", icon: SlidersHorizontal },
];

/** Barre d'onglets du bas (mobile). */
export function MobileNav({
  open,
  onOpen,
  hasSelection,
}: {
  open: MobileSheetId | null;
  onOpen: (id: MobileSheetId | null) => void;
  hasSelection: boolean;
}) {
  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Panneaux du Studio" data-mobile-nav>
      {MOBILE_TABS.map((tab) => {
        const active = open === tab.id;
        const highlight = tab.id === "properties" && hasSelection && !active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onOpen(active ? null : tab.id)}
            className={`relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-accent" : "text-muted hover:text-ink"}`}
            aria-pressed={active}
          >
            <tab.icon className="h-4.5 w-4.5" aria-hidden="true" />
            {tab.label}
            {highlight ? <span className="absolute right-[calc(50%-14px)] top-2 h-2 w-2 rounded-full bg-accent" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Panneau glissant depuis le bas (mobile) ; fond semi-transparent pour fermer. */
export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/40" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-[150] flex max-h-[72svh] flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.6)] pb-[env(safe-area-inset-bottom)]"
        data-mobile-sheet
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <span className="mx-auto mb-1 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line text-muted hover:text-ink" aria-label="Fermer">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </section>
    </>
  );
}
