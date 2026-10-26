import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  themeColor: "#0a0a0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}