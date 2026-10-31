import type { Metadata } from "next";
import StudioApp from "@/components/studio/StudioApp";

export const metadata: Metadata = {
  title: "Motion Studio — Bêta",
  description:
    "Motion Studio : timeline, canvas animé, templates SaaS codés — composez vos vidéos marketing avec des animations de motion design en code.",
  robots: { index: false, follow: false },
};

/**
 * MotionGraphic Studio V1 (branche feature/studio-v1-beta).
 * Interface éditoriale plein écran — le chrome public est masqué.
 */
export default function StudioPage() {
  return <StudioApp />;
}