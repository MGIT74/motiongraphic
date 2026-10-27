import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, PenTool, WandSparkles } from "lucide-react";
import { getSimilarTemplates, getTemplateDetail } from "@/lib/data";
import AnimationPlayer from "@/components/animations/AnimationPlayer";
import PromptPanel from "@/components/prompts/PromptPanel";
import AnimationCard from "@/components/gallery/AnimationCard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = await getTemplateDetail(slug);
  if (!template) return { title: "Template introuvable" };
  return {
    title: template.title,
    description: template.description,
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = await getTemplateDetail(slug);
  if (!template) notFound();

  const similar = await getSimilarTemplates(template, 3);

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-10 pt-32 sm:px-8">
      <Link
        href="/explore"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la galerie
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
        {/* Aperçu animation */}
        <div className="flex flex-col gap-6">
          <AnimationPlayer
            componentKey={template.componentKey}
            config={template.config}
            className="aspect-video w-full rounded-3xl border border-line bg-surface"
          />
          <PromptPanel prompts={template.prompts} />
        </div>

        {/* Infos */}
        <aside className="flex flex-col gap-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {template.category ? (
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {template.category.name}
                </span>
              ) : null}
              {template.isFeatured ? (
                <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                  À la une
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {template.title}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
              {template.description}
            </p>
          </header>

          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface/60 p-5">
            <h2 className="text-sm font-semibold text-ink">Caractéristiques</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <WandSparkles className="h-4 w-4" aria-hidden="true" /> Composant
                </dt>
                <dd className="font-mono text-xs text-ink">{template.componentKey}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <Clock3 className="h-4 w-4" aria-hidden="true" /> Durée indicative
                </dt>
                <dd className="text-ink">≈ {template.duration}s</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <PenTool className="h-4 w-4" aria-hidden="true" /> Technologies
                </dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {template.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted"
                    >
                      {tech}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
              {template.componentDescription}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface/60 p-5">
            <h2 className="text-sm font-semibold text-ink">Copier les prompts</h2>
            <p className="mt-1 text-xs text-muted">
              Aucune inscription requise — le prompt est copié tel quel dans votre presse-papiers.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <DetailCopyButtons prompts={template.prompts} />
            </div>
          </div>
        </aside>
      </div>

      {similar.length > 0 ? (
        <section className="mt-16" aria-label="Templates similaires">
          <h2 className="mb-6 text-xl font-semibold tracking-tight sm:text-2xl">
            Templates similaires
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((t) => (
              <AnimationCard key={t.id} template={t} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

import CopyButton from "@/components/prompts/CopyButton";

import type { TemplatePrompt } from "@/types/template";

function DetailCopyButtons({ prompts }: { prompts: TemplatePrompt[] }) {
  const web = prompts.find((p) => p.type === "web");
  const ae = prompts.find((p) => p.type === "after_effects");
  if (!web && !ae) return <p className="text-xs text-muted">Prompts en préparation.</p>;
  return (
    <>
      {web ? (
        <CopyButton text={web.content} label="Copy Prompt Web" variant="primary" className="h-10 text-xs" />
      ) : null}
      {ae ? (
        <CopyButton text={ae.content} label="Copy Prompt After Effects" variant="outline" className="h-10 text-xs" />
      ) : null}
    </>
  );
}