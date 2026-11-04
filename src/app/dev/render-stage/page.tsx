import { notFound } from "next/navigation";
import RenderStage from "@/components/render/RenderStage";
import type { StudioCustomTemplateInput } from "@/lib/templates/published-studio";
import {
  PULSE_GRID_CODE,
  buildSandboxExportProject,
  PULSE_GRID_TEMPLATE_ID,
  PULSE_GRID_TEMPLATE_DEFAULT_CONFIG,
} from "@/lib/testing/sandbox-fixture";

/**
 * Scène de rendu de TEST (TEMPLATE_CHECK=1 uniquement, jamais en production).
 *
 * Même scène de rendu que /render/<id> mais projet en ligne (aucun Supabase) :
 * les tests d'export MP4 (tests/export) utilisent le MÊME moteur
 * (window.__mgsiRender.seek + captures) que l'export de production.
 * Format via searchParams : ?w=1080&h=1920 (9:16) / ?w=1080&h=1080 (1:1).
 */
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const customTemplates: StudioCustomTemplateInput[] = [
  {
    id: PULSE_GRID_TEMPLATE_ID,
    slug: "pulse-grid-demo",
    name: "Pulse Grid (démo code)",
    category: "ui-motion",
    sourceKind: "code",
    elementKind: "cards",
    defaultConfig: PULSE_GRID_TEMPLATE_DEFAULT_CONFIG,
    code: PULSE_GRID_CODE,
    capabilities: { studioCompatible: true, exportCompatible: true, reasons: [], contractDuration: 2 },
    version: 1,
  },
];

export default async function DevRenderStagePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; h?: string }>;
}) {
  if (process.env.TEMPLATE_CHECK !== "1") notFound();
  const { w, h } = await searchParams;
  const width = clampDim(Number(w) || 1920);
  const height = clampDim(Number(h) || 1080);
  const project = buildSandboxExportProject({ width, height });
  return <RenderStage project={project} customTemplates={customTemplates} />;
}

function clampDim(value: number): number {
  return Math.max(320, Math.min(3840, value % 2 === 0 ? value : value - 1));
}
