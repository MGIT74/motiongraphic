import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * Entrée de l'application privée :
 * - visiteur non connecté -> /login ;
 * - administrateur connecté -> /admin ;
 * - utilisateur connecté -> /studio.
 * La galerie publique n'est plus le front-office de ce domaine
 * (templates et publication conservés — l'intégration vitrine viendra plus tard).
 */
export default async function HomePage() {
  if (!isSupabaseConfigured()) return <DemoEntryPoint />;
  const client = await createSupabaseServerClient();
  if (client) {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
      redirect(profile?.role === "admin" ? "/admin" : "/studio");
    }
  }
  redirect("/login");
}

function DemoEntryPoint() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-5 text-center">
      <div className="max-w-md rounded-3xl border border-line bg-surface/60 p-8">
        <p className="text-sm font-bold text-ink">
          MotionGraphic<span className="text-accent">.si</span> — Studio
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Mode démonstration (Supabase non configuré) : ouvrez le Template Lab
          en localhost pour préparer les templates, ou connectez Supabase pour
          l&apos;application complète.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a href="/admin/lab" className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/85">
            Template Lab (démo)
          </a>
          <a href="/login" className="inline-flex h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-accent/50">
            Connexion
          </a>
        </div>
      </div>
    </div>
  );
}
