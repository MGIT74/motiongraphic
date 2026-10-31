import type { AnimationConfig } from "@/types/animation";
import type { Metadata } from "next";
import StudioApp from "@/components/studio/StudioApp";
import { listPublishedCustomTemplates } from "@/lib/templates/custom-store";
import { customElementKind } from "@/lib/templates/custom-model";

export const metadata: Metadata = {
  title: "Motion Studio — Bêta",
  description:
    "Motion Studio : timeline, canvas animé, templates SaaS codés — composez vos vidéos marketing avec des animations de motion design en code.",
  robots: { index: false, follow: false },
};

/** Template custom « composant » prêt pour la timeline du Studio. */
interface StudioCustomTemplateInput {
  id: string;
  slug: string;
  name: string;
  category: string;
  sourceKind: string;
  componentKey?: string;
  elementKind: string;
  defaultConfig: AnimationConfig;
}

/**
 * MotionGraphic Studio V1 (branche feature/studio-v1-beta).
 * Interface éditoriale plein écran — le chrome public est masqué.
 *
 * Les templates personnalisés PUBLIÉS (bibliothèque commune) sont injectés
 * dans le registre runtime du Studio au montage : source « composant » →
 * pilotable par la timeline (builder du composant de base) ; source
 * « code » → exclus de la timeline (Phase 2 : pipeline de compilation).
 */
export default async function StudioPage() {
  let customTemplates: StudioCustomTemplateInput[] = [];

  try {
    const published = await listPublishedCustomTemplates();
    customTemplates = published
      .filter((t) => t.sourceKind === "component" && t.componentKey)
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        sourceKind: t.sourceKind,
        componentKey: t.componentKey,
        elementKind: customElementKind(t),
        defaultConfig: t.defaultConfig,
      }));
  } catch {
    // En cas d'échec de la source custom : le Studio reste fonctionnel
    // avec les templates intégrés (jamais de faux catalogue).
    customTemplates = [];
  }

  return <StudioApp customTemplates={customTemplates} />;
}
