import Link from "next/link";
import { ArrowRight, Copy, Eye, MousePointerClick, Sparkles } from "lucide-react";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import DemoBanner from "@/components/gallery/DemoBanner";
import { getPublishedTemplates, isDemoMode } from "@/lib/data";

const STEPS = [
  {
    icon: Eye,
    title: "Découvrez",
    text: "Explorez une galerie d’animations professionnelles exécutées en direct dans votre navigateur.",
  },
  {
    icon: MousePointerClick,
    title: "Choisissez",
    text: "Sélectionnez un template agrandi, analysez son mouvement, sa rythmique et ses couleurs.",
  },
  {
    icon: Copy,
    title: "Copiez le prompt",
    text: "Un prompt Web (HTML/CSS/GSAP) et un prompt After Effects par template, en un clic.",
  },
  {
    icon: Sparkles,
    title: "Créez avec l’IA",
    text: "Collez le prompt dans ChatGPT ou Claude et générez la même animation avec votre contenu.",
  },
];

export default async function HomePage() {
  const templates = await getPublishedTemplates();
  const demo = isDemoMode();

  return (
    <div className="animate-hero">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="grid-lines absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-5 pb-16 pt-20 text-center sm:px-8 sm:pb-20 sm:pt-28">
          <p className="mg-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Galerie de motion design · Prompts IA inclus
          </p>
          <h1
            className="mg-reveal text-gradient max-w-4xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl"
            style={{ animationDelay: "0.08s" }}
          >
            Des animations pro, exécutées en direct. Reproduisez-les avec l’IA.
          </h1>
          <p
            className="mg-reveal mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "0.16s" }}
          >
            MotionGraphic.si est une bibliothèque de templates de motion design animés en code —
            chacun accompagné d’un prompt Web et d’un prompt After Effects, prêts à être copiés.
          </p>
          <div
            className="mg-reveal mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "0.24s" }}
          >
            <Link
              href="/explore"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-white transition-all hover:bg-accent/85 hover:shadow-[0_10px_40px_-12px_rgba(10,132,255,0.55)]"
            >
              Explorer la galerie
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/studio"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-surface/40 px-7 text-sm font-medium text-ink transition-colors hover:border-accent/50"
            >
              Motion Studio
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">Soon</span>
            </Link>
          </div>

            <p
              className="mg-reveal mt-6 text-xs text-muted"
              style={{ animationDelay: "0.3s" }}
            >
              Aucune inscription requise — consulter et copier les prompts gratuits est et restera gratuit.
            </p>
        </div>
      </section>

      {demo ? (
        <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <DemoBanner />
        </section>
      ) : null}

      {/* Galerie */}
      <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <GalleryGrid templates={templates} showFilters initialCount={6} heading="Templates à la une" />
      </section>

      {/* Comment ça marche */}
      <section className="border-t border-line bg-surface/30">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Comment ça marche&nbsp;?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted sm:text-base">
            Quatre étapes, zéro friction. Aucun compte n’est nécessaire pour explorer et copier les prompts.
          </p>
          <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="group relative rounded-2xl border border-line bg-surface/60 p-6 transition-colors hover:border-accent/40"
              >
                <span className="absolute right-5 top-5 font-mono text-xs text-muted/60">
                  0{i + 1}
                </span>
                <step.icon
                  className="h-6 w-6 text-accent transition-transform duration-300 group-hover:scale-110"
                  aria-hidden="true"
                />
                <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-col items-center gap-5 rounded-3xl border border-line bg-gradient-to-b from-surface to-transparent px-6 py-14 text-center sm:px-12">
          <h2 className="max-w-2xl text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Votre prochaine animation n’est qu’un prompt.
          </h2>
          <p className="max-w-xl text-sm text-muted sm:text-base">
            Parcourez la galerie, copiez le prompt Web ou After Effects et laissez l’IA construire l’animation pour vous.
          </p>
          <Link
            href="/explore"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white transition-all hover:bg-accent/85"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Voir les templates
          </Link>
        </div>
      </section>
    </div>
  );
}