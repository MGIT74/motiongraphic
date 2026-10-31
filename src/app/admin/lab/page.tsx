import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import TemplateLab from "@/components/admin/TemplateLab";

export const metadata: Metadata = {
  title: "Template Lab — Administration",
  robots: { index: false, follow: false },
};

/**
 * Template Lab accessible en MODE DÉMONSTRATION (store mémoire) :
 * création/édition/preview/publication de templates interactifs, sans
 * Supabase. En mode Supabase, le lab vit dans /admin (onglet dédié, RLS).
 */
export default function AdminLabPage() {
  if (isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-36 sm:px-8">
        <div className="rounded-3xl border border-line bg-surface/60 p-8 text-center">
          <CircleAlert className="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">Supabase actif</h1>
          <p className="mt-2 text-sm text-muted">
            Utilisez le Template Lab intégré à l&apos;administration (onglet
            « Template Lab ») : les templates y sont stockés en base avec RLS.
          </p>
          <Link
            href="/admin"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
          >
            Aller à l&apos;administration
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-32 sm:px-8">
      <header className="mb-6">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-dashed border-accent/30 bg-accent/5 px-4 py-1.5 text-xs text-muted">
          <CircleAlert className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          Mode démonstration — ce labo utilise un store mémoire locale du
          serveur : aucune publication réelle en ligne.
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Template Lab</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Créez, prévisualisez et publiez vos propres templates d&apos;animations
          codées : dérivés d&apos;un composant approuvé (dispo immédiatement
          dans la galerie et le Studio) ou de votre code	source (bac à sable
          isolé, pipeline versionné).
        </p>
      </header>
      <TemplateLab backend="demo" />
    </div>
  );
}