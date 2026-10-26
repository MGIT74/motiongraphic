"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SearchX } from "lucide-react";
import type { TemplateSummary } from "@/types/template";
import AnimationCard from "./AnimationCard";

interface GalleryGridProps {
  templates: TemplateSummary[];
  showSearch?: boolean;
  showFilters?: boolean;
  /** Nombre de cartes rendues initialement (chargement progressif). */
  initialCount?: number;
  /** Nombre de cartes ajoutées à chaque lot. */
  step?: number;
  emptyMessage?: string;
  heading?: string;
}

/**
 * Grille responsive de la galerie : recherche client, filtres par catégorie,
 * chargement progressif. Les données viennent de la couche `src/lib/data.ts`
 * — la grille ne connaît pas Supabase.
 */
export default function GalleryGrid({
  templates,
  showSearch = false,
  showFilters = false,
  initialCount = 9,
  step = 6,
  emptyMessage,
  heading,
}: GalleryGridProps) {
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Chargement progressif : le token filtre change -> le compteur dérivé revient
  // à initialCount (aucun setState dans un effet, pattern "state dérivé").
  const [loadedState, setLoadedState] = useState<{ token: string; count: number }>({
    token: "",
    count: initialCount,
  });
  const filterToken = `${query}|${categorySlug}|${templates.length}`;
  const visibleCount = loadedState.token === filterToken ? loadedState.count : initialCount;

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    templates.forEach((t) => {
      if (t.category) map.set(t.category.slug, t.category.name);
    });
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const matchCategory = !categorySlug || t.category?.slug === categorySlug;
      const matchQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category?.name.toLowerCase().includes(q) ?? false);
      return matchCategory && matchQuery;
    });
  }, [templates, query, categorySlug]);

  const visible = filtered.slice(0, visibleCount);

  // Chargement progressif : auto-load via sentinelle
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setLoadedState((prev) => {
          const current = prev.token === filterToken ? prev.count : initialCount;
          if (current >= filtered.length) return prev;
          return {
            token: filterToken,
            count: Math.min(current + step, filtered.length),
          };
        });
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, step, filterToken, initialCount]);

  return (
    <section aria-label={heading ?? "Galerie d'animations"}>
      {heading ? (
        <h2 className="mb-6 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{heading}</h2>
      ) : null}

      {showSearch ? (
        <label className="relative mb-4 block max-w-md">
          <span className="sr-only">Rechercher un template</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un template…"
            className="h-11 w-full rounded-full border border-line bg-surface/60 pl-11 pr-4 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-accent/60 focus:outline-none"
          />
        </label>
      ) : null}

      {showFilters ? (
        <div className="mb-6 flex flex-wrap gap-2" aria-label="Filtres par catégorie" id="categories">
          <button
            type="button"
            onClick={() => setCategorySlug(null)}
            className={`h-9 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors ${
              categorySlug === null
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:border-accent/40 hover:text-ink"
            }`}
            aria-pressed={categorySlug === null}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setCategorySlug(cat.slug)}
              className={`h-9 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors ${
                categorySlug === cat.slug
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:border-accent/40 hover:text-ink"
              }`}
              aria-pressed={categorySlug === cat.slug}
            >
              {cat.name}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center">
          <SearchX className="h-7 w-7 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            {emptyMessage ??
              "Aucun template ne correspond à cette recherche. Essayez un autre mot-clé ou une autre catégorie."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <AnimationCard key={t.id} template={t} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />

      {visibleCount < filtered.length ? (
        <div className="mt-6 text-center">
          <p className="text-xs text-muted">
            {visible.length} / {filtered.length} templates affichés — défilez pour charger la suite.
          </p>
        </div>
      ) : null}
    </section>
  );
}