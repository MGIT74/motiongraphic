import type { Metadata, Viewport } from "next";
import StudioApp from "@/components/studio/StudioApp";
import { listStudioCustomTemplates } from "@/lib/templates/published-studio";
import { requireUser } from "@/lib/auth/guards";

// Lecture à CHAQUE requête : un template publié dans le Lab apparaît
  // immédiatement (aucun rebuild nécessaire). Sans cela le page était
  // prérendue au build -> catalogue Studio périmé.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Motion Studio — Bêta",
  description:
    "Motion Studio : timeline, canvas animé, templates SaaS codés — composez vos vidéos marketing avec des animations de motion design en code.",
  robots: { index: false, follow: false },
};

/**
 * Éditeur plein écran : sur mobile, pas de zoom de page (pincement, double toucher)
 * qui ferait bouger toute l'interface pendant l'édition.
 */
export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Studio : TOUS les templates personnalisés publiés (composants + codes)
 * sont passés au registre runtime — le Studio distingue compatibilité
 * (via `registerCustomStudioTemplates`) et affiche les raisons.
 */
export default async function StudioPage() {
  await requireUser("/studio");
  let customTemplates: StudioCustomTemplateInput[] = [];
  try {
    customTemplates = await listStudioCustomTemplates();
  } catch {
    // En cas d'échec de la source custom : le Studio reste fonctionnel
    // avec les templates intégrés (jamais de faux catalogue).
    customTemplates = [];
  }

  return <StudioApp customTemplates={customTemplates} />;
}

export type { StudioCustomTemplateInput } from "@/lib/templates/published-studio";
import type { StudioCustomTemplateInput } from "@/lib/templates/published-studio";
