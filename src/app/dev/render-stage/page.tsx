import { notFound } from "next/navigation";
import RenderStage from "@/components/render/RenderStage";
import type { StudioCustomTemplateInput } from "@/lib/templates/published-studio";
import {
  PULSE_GRID_CODE,
  buildSandboxExportProject,
  PULSE_GRID_TEMPLATE_ID,
  PULSE_GRID_TEMPLATE_DEFAULT_CONFIG,
  BROKEN_TEMPLATE,
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
  searchParams: Promise<{ w?: string; h?: string; degraded?: string; broken?: string }>;
}) {
  if (process.env.TEMPLATE_CHECK !== "1") notFound();
  const { w, h, degraded, broken } = await searchParams;
  const width = clampDim(Number(w) || 1920);
  const height = clampDim(Number(h) || 1080);
  const project = buildSandboxExportProject({ width, height });
  if (degraded === "1") {
    // Cas de test : un template code NON déterministe (mode libre) dans la
    // scène -> le moteur doit REFUSER le rendu (jamais d'export dégradé).
    const withFree = {
      ...project,
      scenes: [
        ...project.scenes,
        {
          id: "scene-free-code",
          name: "Free code",
          duration: 1,
          elements: [
            {
              id: "element-free-1",
              label: "Free",
              kind: "cards" as const,
              templateKey: "free-code-test",
              start: 0,
              duration: 1,
              config: { ...project.scenes[0].elements[0].config, text: "FREE" },
              x: 50,
              y: 50,
              scale: 1,
            },
          ],
        },
      ],
    };
    return <RenderStage project={withFree} customTemplates={[...customTemplates, FREE_CODE_TEMPLATE_INPUT]} />;
  }
  if (broken === "1") {
    // Cas de test : contrat déclaré, renderAt en ÉCHEC à l'exécution —
    // le runtime doit rejeter les seek (FRAME_DÉGRADÉE) et l'export échouer.
    const withBroken = {
      ...project,
      scenes: [
        {
          id: "scene-broken-code",
          name: "Broken",
          duration: 1,
          elements: [
            {
              id: "element-broken-1",
              label: "Broken",
              kind: "cards" as const,
              templateKey: "broken-code-test",
              start: 0,
              duration: 1,
              config: { ...project.scenes[0].elements[0].config, text: "BROKEN" },
              x: 50,
              y: 50,
              scale: 1,
            },
          ],
        },
      ],
    };
    return <RenderStage project={withBroken} customTemplates={[...customTemplates, BROKEN_TEMPLATE_INPUT]} />;
  }
  return <RenderStage project={project} customTemplates={customTemplates} />;
}

const BROKEN_TEMPLATE_INPUT: StudioCustomTemplateInput = {
  id: BROKEN_TEMPLATE.id,
  slug: BROKEN_TEMPLATE.slug,
  name: BROKEN_TEMPLATE.name,
  category: BROKEN_TEMPLATE.category,
  sourceKind: BROKEN_TEMPLATE.sourceKind,
  elementKind: "cards",
  defaultConfig: BROKEN_TEMPLATE.defaultConfig,
  code: BROKEN_TEMPLATE.code,
  capabilities: { studioCompatible: true, exportCompatible: true, reasons: [], contractDuration: 1 },
  version: 1,
};

const FREE_CODE_TEMPLATE_INPUT: StudioCustomTemplateInput = {
  id: "free-code-test",
  slug: "free-code-test",
  name: "Free (non pilodable)",
  category: "ui-motion",
  sourceKind: "code",
  elementKind: "cards",
  defaultConfig: { text: "FREE", primaryColor: "#F5F5F7", accentColor: "#0A84FF", backgroundColor: "#000000", duration: 1, speed: 1 },
  code: "var x = 1; // sans contrat __MGS_TIMELINE__",
  capabilities: { studioCompatible: false, exportCompatible: false, reasons: ["Pas de contrat renderAt(time)"] },
  version: 1,
};

function clampDim(value: number): number {
  return Math.max(320, Math.min(3840, value % 2 === 0 ? value : value - 1));
}
