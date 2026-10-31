import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ANIMATION_SELECT, toDetail, type AnimationRowLike } from "@/lib/template-mappers";
import type { TemplateDetail } from "@/types/template";
import AnimationPlayer from "@/components/animations/AnimationPlayer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aperçu privé | Administration", robots: { index: false, follow: false } };

export default async function AdminPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") notFound();

  // Authenticated admin session and Supabase RLS allow viewing drafts.
  const { data, error } = await client.from("animations").select(ANIMATION_SELECT).eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const row = data as unknown as AnimationRowLike;
  const { data: prompts, error: promptsError } = await client.from("prompts")
    .select("id, animation_id, type, content, version").eq("animation_id", id);
  if (promptsError) throw new Error(promptsError.message);
  const template = toDetail(row, (prompts ?? []) as TemplateDetail["prompts"], row.updated_at);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/admin" className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-ink">← Retour à l’administration</Link>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent">
          Aperçu privé · {template.isPublished ? "Publié" : "Brouillon non publié"}
        </span>
      </div>
      <h1 className="text-3xl font-bold">{template.title}</h1>
      <p className="mb-7 mt-2 text-sm text-muted">{template.description}</p>
      <AnimationPlayer componentKey={template.componentKey} config={template.config}
        className="aspect-video w-full rounded-3xl border border-line bg-surface" />
      <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-5 text-sm text-muted">
        Cet aperçu est réservé aux administrateurs. Il ne publie pas le template et n’enregistre aucun événement de copie.
      </div>
    </div>
  );
}
