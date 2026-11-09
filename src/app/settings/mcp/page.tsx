import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import McpTokensPanel from "@/components/settings/McpTokensPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexions MCP — MotionGraphic", robots: { index: false, follow: false } };

/**
 * « Accès MCP » — chaque utilisateur gère SES jetons MCP.
 * Renseigné depuis #34 : la navigation « Connexions MCP » pointe ici.
 * Le panneau fonctionne contre le contrat d'API documenté ; tant que la
 * fonctionnalité serveur n'est pas activée (drapeau), l'état clair
 * « pas encore activée » est affiché.
 */
export default async function McpConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ "demo-admin"?: string }>;
}) {
  const configured = isSupabaseConfigured();
  const client = await createSupabaseServerClient();

  if (!configured) {
    // Mode démonstration : vue utilisateur (l'administration requiert une
    // vraie session). `?demo-admin=1` : simple aperçu d'interface DÉMO
    // (cosmétique) ; en session réelle ceparamètre est ignoré — le rôle
    // vient de la base et l'API admin reste réellement protégée.
    const { "demo-admin": demoAdmin } = await searchParams;
    const isAdmin = demoAdmin === "1";
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-32 text-ink">
        <Link href="/studio" className="text-sm text-muted hover:text-ink">← Retour au Studio</Link>
        <h1 className="mt-8 text-3xl font-bold">Connexions MCP</h1>
        <p className="mt-3 text-sm text-muted">Connectez vos assistants IA à vos projets MotionGraphic.</p>
        <div className="mt-6 rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-5 text-sm text-muted" data-mcp-demo-note>
          Mode démonstration : administration et sessions désactivées. Les
          variables <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
          <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> doivent être
          configurées pour activer l&apos;authentification réelle.
        </div>
        <McpTokensPanel isAdmin={isAdmin} />
      </main>
    );
  }

  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) redirect("/login");
    // Fail-closed (comme partout) : profil lu de la base = la source.
    const { data: profile } = await client.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
    const row = (profile as { role?: string; status?: string } | null) ?? null;
    if (!row || row.status !== "active") redirect("/login");
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-32 text-ink">
        <Link href="/studio" className="text-sm text-muted hover:text-ink">← Retour au Studio</Link>
        <h1 className="mt-8 text-3xl font-bold">Connexions MCP</h1>
        <p className="mt-3 text-sm text-muted">Connectez vos assistants IA à VOS projets MotionGraphic.</p>
        <McpTokensPanel isAdmin={row.role === "admin"} />
      </main>
    );
  }
  redirect("/login");
}
