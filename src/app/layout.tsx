import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteChrome from "@/components/layout/SiteChrome";

export const metadata: Metadata = {
  title: {
    default: "MotionGraphic.si — Templates de motion design & prompts IA",
    template: "%s · MotionGraphic.si",
  },
  description:
    "Découvrez des animations de motion design exécutées en direct dans votre navigateur, copiez les prompts Web (GSAP, SVG, React) ou After Effects et reproduisez-les avec ChatGPT ou Claude.",
  metadataBase: new URL("https://motiongraphic.si"),
  openGraph: {
    title: "MotionGraphic.si",
    description:
      "Galerie de templates de motion design animés en code, avec prompts IA copiables.",
    url: "https://motiongraphic.si",
    siteName: "MotionGraphic.si",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" suppressHydrationWarning data-scroll-behavior="smooth" className="h-full antialiased">
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col"
      >
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}