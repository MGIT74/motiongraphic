import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

/**
 * Garde d’autorisation côté serveur (page dynamique) :
 * 1. Supabase configuré et session valide via `getUser()` (vérifie le JWT, pas
 *    seulement les cookies) ;
 * 2. rôle admin vérifié dans `profiles` — les politiques RLS de la base
 *    appliquent exactement les mêmes règles (source de vérité : la base).
 */
export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-36 sm:px-8">
        <div className="rounded-3xl border border-dashed border-accent/30 bg-accent/5 p-8">
          <h1 className="text-2xl font-bold tracking-tight">Administration indisponible</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Le site fonctionne actuellement en <strong className="text-ink">mode démonstration</strong>
            (données locales). L’administration requiert Supabase (Auth + RLS).
            Renseignez <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
            <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans{" "}
            <code className="font-mono text-xs text-ink">.env.local</code>, appliquez la migration SQL
            (<code className="font-mono text-xs text-ink">supabase/migrations/0001_init.sql</code>), puis
            rechargez cette page. Guide complet dans le README.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent/50"
          >
            Retour au site
          </Link>
        </div>
      </div>
    );
  }

  const client = await createSupabaseServerClient();
  if (!client) return null;

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return <AccessDenied signedIn={false} />;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") return <AccessDenied signedIn />;

  return (
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-32 sm:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Administration</h1>
        <p className="mt-2 text-sm text-muted">
          Gestion des templates, des prompts et des catégories. Les autorisations sont appliquées
          par les politiques RLS Supabase.
        </p>
      </header>
      <AdminDashboard isAdmin={true} />
    </div>
  );
}

function AccessDenied({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-24 pt-40 text-center sm:px-8">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface/70">
        <Lock className="h-6 w-6 text-accent" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        {signedIn ? "Accès réservé aux administrateurs" : "Connexion requise"}
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        {signedIn
          ? "Votre compte n’a pas le rôle « admin ». Ce rôle est attribué en base (profiles.role) par un administrateur existant ou via SQL."
          : "Connectez-vous avec un compte administrateur pour accéder à cet espace."}
      </p>
      <div className="mt-8 flex gap-3">
        {!signedIn ? (
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
          >
            Se connecter
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-6 text-sm font-medium text-ink transition-colors hover:border-accent/50"
        >
          Retour au site
        </Link>
      </div>
    </div>
  );
}