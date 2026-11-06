import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (ex-middleware Next 16) — application privée :
 * 
 * Rôles :
 * 1. Rafraîchissement de la session Supabase (quand configuré).
 * 2. Contrôle d'accès serveur (le masquage d'UI ne remplace jamais ceci) :
 *    - sans session  : /login (les pages privées et la galerie) ;
 *    - administrateur : tout ;
 *    - utilisateur connecté : /studio, /settings/mcp, les API Studio ;
 *    - visiteur        : /login, /api/mcp (auth MCP propre), /render (jeton
 *      signé), /.well-known (découverte MCP), robots/sitemap.
 *
 * Le legacy MCP_ACCESS_TOKEN / la découverte MCP ne passent PAS par la
 * session Supabase : /api/mcp continue d'authentifier par ses propres jetons.
 */
const PUBLIC_EXACT = ["/login", "/api/mcp", "/robots.txt", "/sitemap.xml"];
const PUBLIC_PREFIXES = ["/render/", "/.well-known/"];

/** Pages et API privées (session utilisateur requise ; RLS/roles ensuite). */
const PRIVATE_PREFIXES = ["/admin", "/studio", "/settings", "/explore", "/templates/", "/api/studio/", "/api/templates/"];

function isPrivate(path: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Chemins non privés (auth propre : MCP/render, ou publics sans données). */
function isExemptFromSession(path: string): boolean {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  console.log("[PROXY]", request.nextUrl.pathname, "| privé:", request.nextUrl.pathname.startsWith("/admin"));
  const path = request.nextUrl.pathname;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // MODE DÉMONSTRATION (Supabase non configuré, développement local) :
    // pas d'utilisateurs en base — l'éditeur reste accessible en local
    // pour les tests ; les pages privées exigent l'hôte local.
    if (isPrivate(path) && !isLocalHost(request)) {
      return redirectToLogin(request);
    }
    return NextResponse.next();
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

  /* --------------------- contrôle d'accès serveur ----------------------- */

  if (isExemptFromSession(path)) return response;

  if (isPrivate(path)) {
    let role: string | null = null;
    if (user) {
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      role = (data as { role?: string } | null)?.role ?? "user";
    }
    if (!user) {
      const redirect = redirectToLogin(request);
      // Conserve les cookies de session éventuellement rafraîchis.
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
    // Administrateur : seul à passer /admin* (Template Lab, utilisateurs).
    if (path.startsWith("/admin") && role !== "admin") {
      return response;
    }
    // Les API de templates (Lab) sont réservées à l'administrateur ; les API
    // Studio (projets/médias/rendus propres à l'utilisateur) restent ouvertes
    // aux utilisateurs connectés ; le filtrage détaillé est appliqué par RLS.
    if (path.startsWith("/api/templates/") && role !== "admin") {
      const blocked = NextResponse.json(
        { ok: false, errors: ["Administration requise."] },
        { status: 403 }
      );
      response.cookies.getAll().forEach((cookie) => blocked.cookies.set(cookie));
      return blocked;
    }
    return response;
  }

  return response;
}

function isLocalHost(request: NextRequest): boolean {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

function redirectToLogin(request: NextRequest): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = "/login";
  if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/login") {
    destination.searchParams.set("next", request.nextUrl.pathname);
  }
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};