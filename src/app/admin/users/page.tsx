import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gestion des utilisateurs — MotionGraphic", robots: { index: false, follow: false } };

export default async function UsersAdminPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profileData } = await client.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const profile = profileData as { role?: string; status?: string } | null;
  if (profile?.role !== "admin" || profile?.status === "suspended") redirect("/studio");
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20 pt-32 text-ink">
      <Link href="/admin" className="text-sm text-muted hover:text-ink">← Administration</Link>
      <h1 className="mt-8 text-3xl font-bold">Gestion des utilisateurs</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Comptes privés MotionGraphic. Les invitations partent par email (expiration 14 jours),
        les rôles et les suspensions sont appliqués côté serveur. La clé d&apos;administration
        ne quitte jamais le serveur.
      </p>
      <AdminUsersPanel />
    </main>
  );
}
