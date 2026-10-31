import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getComponentMeta } from "@/lib/animations/registry";
import {
  ANIMATION_SELECT,
  toDetail,
  toSummary,
  type AnimationRowLike,
} from "@/lib/template-mappers";
import type { Category, TemplateDetail, TemplateSummary } from "@/types/template";
import { demoStore } from "@/data/demo";

/**
 * Couche d'accès données unique de l'application.
 *
 * - Supabase non configuré -> mode démo (données locales de `src/data/demo.ts`).
 * - Supabase configuré     -> requêtes réelles via la clé "anon" + RLS.
 *
 * Ce fichier est uniquement utilisable côté serveur (pages App Router).
 * Si Supabase est configuré mais injoignable, une erreur est levée :
 * le mode démo ne simule jamais une connexion réussie.
 */

type DemoTemplate = (typeof demoStore.templates)[number];

/* ------------------------------------------------------------------ */
/* Mode démo                                                           */
/* ------------------------------------------------------------------ */

function demoCategoryOf(t: DemoTemplate) {
  const cat = demoStore.categories.find((c) => c.slug === t.categoryId) ?? null;
  return cat ? { name: cat.name, slug: cat.slug } : null;
}

function demoSummary(t: DemoTemplate): TemplateSummary {
  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    description: t.description,
    category: demoCategoryOf(t),
    componentKey: t.componentKey,
    config: t.config,
    duration: t.duration,
    isFeatured: true,
  };
}

function demoDetail(t: DemoTemplate): TemplateDetail {
  const summary = demoSummary(t);
  const meta = getComponentMeta(t.componentKey);
  return {
    ...summary,
    isPublished: true,
    prompts: demoStore.prompts.get(t.id) ?? [],
    updatedAt: "2026-10-20T09:00:00.000Z",
    componentTitle: meta.name,
    technologies: meta.technologies,
    componentDescription: meta.description,
  };
}

/* ------------------------------------------------------------------ */
/* API du dépôt de données (Supabase réel)                             */
/* ------------------------------------------------------------------ */

export async function getCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return demoStore.categories;
  const client = await createSupabaseServerClient();
  if (!client) return demoStore.categories;
  const { data, error } = await client
    .from("categories")
    .select("id, name, slug, description, created_at")
    .order("name");
  if (error) throw new Error(`Supabase (categories) : ${error.message}`);
  return ((data ?? []) as unknown as Category[]);
}

export async function getPublishedTemplates(): Promise<TemplateSummary[]> {
  if (!isSupabaseConfigured()) return demoStore.templates.map(demoSummary);
  const client = await createSupabaseServerClient();
  if (!client) return demoStore.templates.map(demoSummary);
  const { data, error } = await client
    .from("animations")
    .select(ANIMATION_SELECT)
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase (animations) : ${error.message}`);
  return (((data ?? []) as unknown as AnimationRowLike[])).map(toSummary);
}

/** Détail d'un template (anonyme : uniquement les publiés, via RLS). */
export async function getTemplateDetail(slug: string): Promise<TemplateDetail | null> {
  if (!isSupabaseConfigured()) {
    const t = demoStore.templates.find((x) => x.slug === slug);
    return t ? demoDetail(t) : null;
  }
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("animations")
    .select(ANIMATION_SELECT)
    .eq("slug", slug)
    .limit(1);
  if (error) throw new Error(`Supabase (animation) : ${error.message}`);
  const row = ((data ?? null) as unknown as AnimationRowLike[] | null)?.[0];
  if (!row) return null;

  const { data: promptsData, error: promptsError } = await client
    .from("prompts")
    .select("id, animation_id, type, content, version")
    .eq("animation_id", row.id);
  if (promptsError) throw new Error(`Supabase (prompts) : ${promptsError.message}`);

  return toDetail(row, (promptsData as TemplateDetail["prompts"]) ?? [], row.updated_at);
}

export async function getSimilarTemplates(
  detail: TemplateDetail,
  limit = 3
): Promise<TemplateSummary[]> {
  const all = await getPublishedTemplates();
  const sameCategory = all.filter(
    (t) => t.slug !== detail.slug && t.category?.slug === detail.category?.slug
  );
  const others = all.filter(
    (t) => t.slug !== detail.slug && t.category?.slug !== detail.category?.slug
  );
  return [...sameCategory, ...others].slice(0, limit);
}

/**
 * Tout le catalogue pour l'administration (Supabase + rôle admin via RLS ;
 * en mode démo on renvoie le jeu local pour l'aperçu).
 */
export async function getAllTemplateDetails(): Promise<TemplateDetail[]> {
  if (!isSupabaseConfigured()) return demoStore.templates.map(demoDetail);
  const client = await createSupabaseServerClient();
  if (!client) return demoStore.templates.map(demoDetail);
  // Fetch animations and prompts separately: this also works when the
  // PostgREST schema cache has not picked up the FK relationship yet.
  const { data, error } = await client
    .from("animations")
    .select(ANIMATION_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase (admin animations) : ${error.message}`);

  const animations = (data ?? []) as unknown as AnimationRowLike[];
  if (animations.length === 0) return [];

  const { data: promptData, error: promptsError } = await client
    .from("prompts")
    .select("id, animation_id, type, content, version")
    .in("animation_id", animations.map((animation) => animation.id));
  if (promptsError) throw new Error(`Supabase (admin prompts) : ${promptsError.message}`);

  const promptsByAnimation = new Map<string, TemplateDetail["prompts"]>();
  for (const prompt of (promptData ?? []) as unknown as (TemplateDetail["prompts"][number] & { animation_id: string })[]) {
    const existing = promptsByAnimation.get(prompt.animation_id) ?? [];
    existing.push(prompt);
    promptsByAnimation.set(prompt.animation_id, existing);
  }

  return animations.map((animation) =>
    toDetail(animation, promptsByAnimation.get(animation.id) ?? [], animation.updated_at)
  );
}

/** Le site tourne-t-il actuellement en mode démonstration ? */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}