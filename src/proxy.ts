import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { tryActivateSuspendedUser, type ActivationOutcome } from "@/lib/admin/activation";

/**
 * Accès privé au Studio, sans mode construction.
 * Les API conservent leurs propres contrôles d'autorisation.
 * La session est rafraîchie avant toute décision de redirection.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Dérogation strictement réservée aux tests navigateur sur le runner CI local.
  // Ne jamais configurer cette variable sur XCloud ou sur un serveur exposé.
  if (process.env.STUDIO_CI_TEST_BYPASS === "local-only" &&
      process.env.CI === "true" &&
      request.nextUrl.hostname === "localhost" &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next();
  }
  const isHome = path === "/";
  const isLogin = path === "/login";
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  // Toutes les pages applicatives sont privées : ancienne galerie comprise.
  const isPrivate = !isHome && !isLogin && !path.startsWith("/api/") && path !== "/api" &&
    !path.startsWith("/render/") && !path.startsWith("/.well-known/") &&
    path !== "/robots.txt" && path !== "/sitemap.xml";

  // Ne jamais intercepter le rendu signé, les API MCP ni les assets.
  if (!isHome && !isLogin && !isPrivate) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (isHome || isPrivate) return redirect(request, "/login");
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  let admin = false;
  let suspended = false;
  if (user && (isAdmin || isHome || isLogin || isPrivate)) {
    const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
    const profile = data as { role?: string; status?: string } | null;
    admin = profile?.role === "admin";
    suspended = profile?.status === "suspended";
    if (suspended && !isHome) {
      // Garde centrale côté serveur : valider l"invitation AVANT tout
      // accès (couvre connexion directe, liens, renouvellements, appels
      // API — pas seulement le formulaire /login). Seule une invitation
      // en attente valide est consommée (atomique) et activée ici.
      const activation: ActivationOutcome = await tryActivateSuspendedUser(user.id, user.email ?? null);
      if (activation === "activated") {
        // Réévaluer l"identité (rôle de l"invitation) pour la redirection.
        suspended = false;
        const recheck = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
        const fresh = (recheck as { data: { role?: string; status?: string } | null }).data;
        admin = fresh?.role === "admin";
        suspended = fresh?.status === "suspended";
      }
      if (suspended) {
        // Suspension administrative réelle (ou invitation révoquée/épuisée) :
        // aucune navigation privée ; les API renvoient 423 et la RLS bloque.
        return suspendedPage();
      }
    }
  }

  let destination: string | null = null;
  if (!user && (isHome || isPrivate)) destination = "/login";
  else if (user && (isHome || isLogin)) destination = admin ? "/admin" : "/studio";
  else if (user && isAdmin && !admin) destination = "/studio";

  if (!destination) return response;
  const result = redirect(request, destination);
  response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
  return result;
}

/** Page statique de suspension (aucune donnée, pas de navigation privée). */
function suspendedPage(): NextResponse {
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compte suspendu — MotionGraphic</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0c10;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem}p{color:#9ca3af;line-height:1.6}</style></head>
<body><main><h1>Compte suspendu</h1>
<p>Ce compte est désactivé. Vos projets restent enregistrés, mais aucune opération n'est possible actuellement.</p>
<p>Contactez un administrateur de MotionGraphic pour réactiver l'accès.</p></main></body></html>`;
  return new NextResponse(body, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function redirect(request: NextRequest, path: string): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = path;
  destination.search = "";
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
