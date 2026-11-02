import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (ex-middleware Next 16), trois rôles (mode construction actif sauf si
 * la variable d'environnement CONSTRUCTION_MODE vaut "off") :
 * 1. Mode construction : toute page publique est redirigée vers /construction ;
 *    /admin, /login, /api, /.well-known, robots.txt et sitemap.xml restent accessibles.
 * 2. Studio réservé aux admins pendant la construction : /studio s'ouvre
 *    uniquement pour un utilisateur connecté dont `profiles.role = 'admin'`
 *    (vérifié côté serveur via la session Supabase + RLS) ; sinon /construction.
 * 3. Rafraîchissement de la session Supabase pour les routes autorisées,
 *    uniquement quand Supabase est configuré (sinon : mode démo, requête inchangée).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicAllowed = path === "/construction" || path.startsWith("/admin") ||
    path === "/login" ||
    path.startsWith("/api/") || path === "/api" ||
    path === "/robots.txt" || path === "/sitemap.xml" ||
    // Découverte OAuth des clients MCP : répondre 404, pas la page HTML de construction.
    path.startsWith("/.well-known/");
  // Interrupteur : CONSTRUCTION_MODE=off ouvre tout le site (et le Studio) au public.
  const construction = process.env.CONSTRUCTION_MODE !== "off";
  const adminOnly = construction && (path === "/studio" || path.startsWith("/studio/"));

  if (construction && !publicAllowed && !adminOnly) return redirectToConstruction(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Sans Supabase, impossible de vérifier un admin : le Studio reste fermé.
    return adminOnly ? redirectToConstruction(request) : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Vérifie le JWT auprès de Supabase (et rafraîchit le token si nécessaire).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (adminOnly) {
    let isAdmin = false;
    if (user) {
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      isAdmin = (data as { role?: string } | null)?.role === "admin";
    }
    if (!isAdmin) {
      const redirect = redirectToConstruction(request);
      // Conserve les cookies de session éventuellement rafraîchis.
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return response;
}

function redirectToConstruction(request: NextRequest): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = "/construction";
  destination.search = "";
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
