import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexions MCP — MotionGraphic", robots: { index: false, follow: false } };

export default async function McpConnectionsPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-32 text-ink">
      <Link href="/studio" className="text-sm text-muted hover:text-ink">← Retour au Studio</Link>
      <h1 className="mt-8 text-3xl font-bold">Connexions MCP</h1>
      <p className="mt-3 text-sm text-muted">Connectez vos assistants IA à vos projets MotionGraphic.</p>
      <div className="mt-8 space-y-4">
        {["Claude", "ChatGPT"].map((name) => (
          <section key={name} className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">{name}</h2>
            <p className="mt-2 text-sm text-muted">
              Architecture des jetons personnels prête (émise sur demande, stockée hachée,
              révocable, expirable). Les connexions restent inactives jusqu&apos;à validation
              sécurité ; aucun accès n&apos;est accordé automatiquement.
            </p>
            <span className="mt-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-muted">En préparation</span>
          </section>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">Votre connexion MCP administrateur existante est gérée séparément. Ne partagez jamais son jeton d’accès.</p>
    </main>
  );
}
