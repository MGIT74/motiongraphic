import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, Layers, WandSparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Motion Studio — Bientôt disponible",
  description:
    "Motion Studio, l’éditeur de MotionGraphic.si permettant de personnaliser et d’exporter les animations, arrive bientôt.",
};

export default function StudioPage() {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-5 py-20 sm:px-8">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent">
          <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" /> Coming soon
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Motion <span className="text-gradient">Studio</span>
        </h1>
        <p className="mt-5 max-w-lg text-balance text-base leading-relaxed text-muted">
          Le futur atelier de MotionGraphic.si : personnalisez le texte, les couleurs, le rythme et
          l’export de chaque template — directement dans le navigateur, sans écrire une ligne de code.
        </p>

        <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <Layers className="mx-auto h-5 w-5 text-accent" aria-hidden="true" />
            <p className="mt-2 text-muted">Personnalisation des paramètres</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <Download className="mx-auto h-5 w-5 text-accent" aria-hidden="true" />
            <p className="mt-2 text-muted">Export des animations</p>
          </div>
        </div>

        <Link
          href="/explore"
          className="mt-10 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          En attendant, explorez la galerie
        </Link>
      </div>
    </div>
  );
}