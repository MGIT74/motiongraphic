import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RenderStage from "@/components/render/RenderStage";
import { verifyRenderToken } from "@/lib/render/token";
import { loadStoredProject, publishedStudioCustomTemplates } from "@/lib/render/server-projects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rendu", robots: { index: false, follow: false } };

/**
 * Page de rendu (interne) : affiche une scène du projet, sans interface, pour
 * le navigateur sans fenêtre qui capture la vidéo image par image. Accès
 * uniquement avec le jeton signé `k` (HMAC) — sinon 404.
 */
export default async function RenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  if (!verifyRenderToken("render", id, k)) notFound();

  const stored = await loadStoredProject(id);
  if (!stored) notFound();

  return <RenderStage project={stored.project} customTemplates={await publishedStudioCustomTemplates()} />;
}
