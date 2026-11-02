import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (ex-middleware Next 16), deux rôles :
 * 1. Mode construction : toute page publique (Studio compris) est redirigée
 *    vers /construction ; /admin, /api, robots.txt et sitemap.xml restent accessibles.
 * 2. Rafraîchissement de la session Supabase pour les routes autorisées,
 *    uniquement quand Supabase est configuré (sinon : mode démo, requête inchangée).
 */
export async function proxy(request: NextRequest) {
  // Construction mode: block public pages, including Studio, on the server.
  // Preserve administrative access and APIs for ongoing development.
  const path = request.nextUrl.pathname;
  const allowed = path === "/construction" || path.startsWith("/admin") ||
    path.startsWith("/api/") || path === "/api" ||
    path === "/robots.txt" || path === "/sitemap.xml" ||
    // Découverte OAuth des clients MCP : répondre 404, pas la page HTML de construction.
    path.startsWith("/.well-known/");
  if (!allowed) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/construction";
    destination.search = "";
    return NextResponse.redirect(destination, 307);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

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

  // Déclenche le refresh du token si nécessaire (écrit via setAll ci-dessus).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};