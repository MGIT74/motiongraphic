import { type NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCustomTemplates, getCustomTemplateBySlug } from "@/lib/templates/custom-store";
import { buildSandboxDocumentV2, SANDBOX_CSP_FALLBACK_HEADER } from "@/lib/templates/sandbox-runtime";

/**
 * Service du code sandboxé AVEC CSP RÉELLE.
 *
 * L'attribut `csp` des iframes est ignoré par Chromium (spec retirée) : la CSP
 * est donc délivrée ici en EN-TÊTE HTTP — la seule façon d'imposer
 * `default-src 'none'` (réseau, workers, images distantes interdits) dans le
 * document de l'iframe.
 *
 * L'iframe garde sandbox="allow-scripts" (PAS d'allow-same-origin) :
 * - origine opaque -> cookies/stockage/DOM parent inaccessibles (natif) ;
 * - la CSP par en-tête bloque le réseau et les workers ;
 * - le code ne sort jamais via postMessage contractuel (sessions validées).
 *
 * Accès :
 * - template PUBLIÉ : public (lecture seule, immuable) ;
 * - brouillon / candidate : admin uniquement (session vérifiée en mode
 *   Supabase). Mode démo local : ouvert (aucun secret en jeu, serveur local).
 *
 * Paramètres : via les messages (INIT / SET_PARAMS), JAMAIS dans l'URL.
 * Session : `?s=` — identifiant d'instance du rendu (validation des messages).
 */
export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const { id } = await routeParams;
  const requestedVersion = Number(new URL(request.url).searchParams.get("v")) || undefined;
  const sessionId = (new URL(request.url).searchParams.get("s") ?? "").slice(0, 64) || "sandbox-session";

  const template = (await getCustomTemplateBySlug(id)) ?? (await (await listCustomTemplates()).find((t) => t.id === id) ?? null);
  if (!template || template.sourceKind !== "code") {
    return sandboxRedirectError("Template inconnu ou non code source.");
  }

  if (requestedVersion && requestedVersion !== template.version) {
    // Le code a changé depuis l'ouverture : recharger l'iframe (cohérence).
    return sandboxRedirectError(`Version périmée (attendue ${requestedVersion}, disponible ${template.version}).`);
  }

  if (template.status !== "published") {
    if (!isSupabaseConfigured()) {
      // Mode démo local : brouillons servis (pas de secret, serveur de dev).
    } else {
      const client = await createSupabaseServerClient();
      const { data: { user } } = client ? ((await client.auth.getUser()) as { data: { user: { id: string } | null } }) : { data: { user: null } };
      let isAdmin = false;
      if (user && client) {
        const { data: profile } = await client
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        isAdmin = profile?.role === "admin";
      }
      if (!isAdmin) {
        return sandboxRedirectError("Ce template n'est pas publié (accès admin requis).");
      }
    }
  }

  if (!template.code) {
    return sandboxRedirectError("Code source absent pour ce template.");
  }

  const html = buildSandboxDocumentV2(template.code, sessionId, {
    text: template.defaultConfig.text,
    primaryColor: template.defaultConfig.primaryColor,
    accentColor: template.defaultConfig.accentColor,
    backgroundColor: template.defaultConfig.backgroundColor,
    duration: template.defaultConfig.duration,
    speed: template.defaultConfig.speed,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": SANDBOX_CSP_FALLBACK_HEADER,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function sandboxRedirectError(message: string): NextResponse {
  const html = [
    "<!doctype html><html><body style='background:#000;color:#aaa;font:sans-serif 12px;display:flex;align-items:center;justify-content:center;height:100%'>",
    `<p>${message.replace(/[<>&"]/g, "")}</p>`,
    "</body></html>",
  ].join("");
  return new NextResponse(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": SANDBOX_CSP_FALLBACK_HEADER },
  });
}