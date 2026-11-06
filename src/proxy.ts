import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Accès privé au Studio, sans mode construction.
 * Les API conservent leurs propres contrôles d'autorisation.
 * La session est rafraîchie avant toute décision de redirection.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
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
  if (user && (isAdmin || isHome || isLogin)) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    admin = (data as { role?: string } | null)?.role === "admin";
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

function redirect(request: NextRequest, path: string): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = path;
  destination.search = "";
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
