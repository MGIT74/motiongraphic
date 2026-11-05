import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gestion des utilisateurs — MotionGraphic", robots: { index: false, follow: false } };

export default async function UsersAdminPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/studio");
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-32 text-ink">
      <Link href="/admin" className="text-sm text-muted hover:text-ink">← Administration</Link>
      <h1 className="mt-8 text-3xl font-bold">Gestion des utilisateurs</h1>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Accès privé</h2>
        <p className="mt-2 text-sm text-muted">L’inscription publique n’est pas proposée dans l’interface MotionGraphic. Les comptes autorisés doivent être créés par un administrateur dans Supabase Auth. Aucun formulaire de création publique n’est disponible ici.</p>
        <p className="mt-4 text-xs text-muted">La gestion et l’invitation des utilisateurs depuis cette page seront ajoutées après sécurisation des opérations d’administration.</p>
      </div>
    </main>
  );
}
