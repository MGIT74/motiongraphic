import type { Metadata } from "next";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import DemoBanner from "@/components/gallery/DemoBanner";
import { getPublishedTemplates, isDemoMode } from "@/lib/data";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Parcourez la galerie complète de templates de motion design animés en direct — recherche, filtres par catégorie et prompts IA copiables.",
};

export default async function ExplorePage() {
  const templates = await getPublishedTemplates();
  const demo = isDemoMode();

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-12 pt-32 sm:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Explorez la <span className="text-gradient">galerie</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Toutes les animations s’exécutent en direct dans votre navigateur. Cliquez sur une carte
          pour l’aperçu agrandi et les prompts.
        </p>
      </header>

      {demo ? <DemoBanner /> : null}

      <div className="mt-8">
        <GalleryGrid
          templates={templates}
          showSearch
          showFilters
          initialCount={9}
          step={6}
          heading={`${templates.length} template${templates.length > 1 ? "s" : ""} disponible${templates.length > 1 ? "s" : ""}`}
        />
      </div>
    </div>
  );
}