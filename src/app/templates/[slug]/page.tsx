import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, PenTool, ShieldCheck, WandSparkles } from "lucide-react";
import { getSimilarTemplates, getTemplateDetail } from "@/lib/data";
import { resolveTemplate } from "@/lib/templates/registry";
import { getCustomTemplateBySlug } from "@/lib/templates/custom-store";
import { toUnified } from "@/lib/templates/registry";
import PromptPanel from "@/components/prompts/PromptPanel";
import AnimationCard from "@/components/gallery/AnimationCard";
import TemplateDemoControls from "@/components/templates/TemplateDemoControls";

export const dynamic = "force-dynamic";

async function loadTemplate(slug: string) {
  // D'abord les templates personnalisés de l'administration (si publiés),
  // puis la couche standard (démo / Supabase).
  const custom = await getCustomTemplateBySlug(slug);
  if (custom && custom.status === "published") {
    return toUnified(custom);
  }
  const standard = await getTemplateDetail(slug);
  if (standard) {
    return {
      templateId: standard.slug,
      display: {
        name: standard.title,
        description: standard.description,
        category: standard.category?.slug ?? "text-motion",
        slug: standard.slug,
      },
      builtIn: true,
      componentKey: standard.componentKey,
      meta: {
        defaultConfig: standard.config,
        timelineDuration: standard.duration || standard.config.duration,
        elementKind: "text",
        technologies: standard.technologies,
      },
      prompts: {
        web: standard.prompts.find((p) => p.type === "web")?.content ?? "",
        afterEffects: standard.prompts.find((p) => p.type === "after_effects")?.content ?? "",
      },
      isFeatured: standard.isFeatured,
    };
  }
  return resolveTemplate(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = await loadTemplate(slug);
  if (!template) return { title: "Template introuvable" };
  return {
    title: template.display.name,
    description: template.display.description,
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = await loadTemplate(slug);
  if (!template) notFound();

  const similar = await getSimilarTemplates(
    {
      id: template.templateId,
      title: template.display.name,
      slug: template.display.slug,
      description: template.display.description,
      category: { name: template.display.category, slug: template.display.category },
      componentKey: template.componentKey,
      config: template.meta.defaultConfig,
      duration: template.meta.timelineDuration,
      isFeatured: template.isFeatured,
    },
    3
  );

  const prompts = [
    { id: `${template.templateId}-web`, animation_id: template.templateId, type: "web" as const, content: template.prompts.web, version: 1 },
    { id: `${template.templateId}-ae`, animation_id: template.templateId, type: "after_effects" as const, content: template.prompts.afterEffects, version: 1 },
  ].filter((p) => p.content);

  const categoryName = template.display.category === "logo-motion" ? "Logo Motion" : template.display.category.replace(/-/g, " ");

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-10 pt-32 sm:px-8">
      <Link
        href="/explore"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la galerie
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
        {/* Aperçu interactif (modifiable) */}
        <div className="flex flex-col gap-6">
          <TemplateDemoControls
            templateKey={template.componentKey}
            defaultConfig={template.meta.defaultConfig}
            configFromTemplate={template.meta.defaultConfig}
            sourceCode={template.custom?.sourceKind === "code" ? template.custom?.code : undefined}
          />
          <PromptPanel prompts={prompts} animationId={template.templateId} />
        </div>

        {/* Infos */}
        <aside className="flex flex-col gap-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent capitalize">
                {categoryName}
              </span>
              {template.isFeatured ? (
                <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                  À la une
                </span>
              ) : null}
              {template.custom ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Template admin · v{template.custom.version}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {template.display.name}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
              {template.display.description}
            </p>
          </header>

          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface/60 p-5">
            <h2 className="text-sm font-semibold text-ink">Caractéristiques</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <WandSparkles className="h-4 w-4" aria-hidden="true" /> Identifiant
                </dt>
                <dd className="font-mono text-xs text-ink">{template.templateId}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <Clock3 className="h-4 w-4" aria-hidden="true" /> Durée indicative
                </dt>
                <dd className="text-ink">≈ {template.meta.timelineDuration}s</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="inline-flex items-center gap-2 text-muted">
                  <PenTool className="h-4 w-4" aria-hidden="true" /> Technologies
                </dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {template.meta.technologies.map((tech) => (
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
            {template.custom?.sourceKind === "code" ? (
              <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
                Ce template est exécuté dans un bac à sable isolé :
                son code ne peut pas interagir avec le reste du site.
              </p>
            ) : null}
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