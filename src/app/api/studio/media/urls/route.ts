import { NextResponse, type NextRequest } from "next/server";
import { signedMediaUrls } from "@/lib/media/server";
import { authorizeRender } from "../../render/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** URL de lecture signées : POST { assets: [{ id, storagePath }] } → { urls: { id: url } }. */
export async function POST(request: NextRequest) {
  const auth = await authorizeRender(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as { assets?: unknown };
  const assets = Array.isArray(body.assets) ? body.assets : [];
  // Uniquement les fichiers de l'utilisateur authentifié (préfixe du chemin).
  const own = assets
    .filter((a): a is { id: string; storagePath: string } =>
      typeof a === "object" && a !== null && typeof (a as { id?: unknown }).id === "string" &&
      typeof (a as { storagePath?: unknown }).storagePath === "string" &&
      (a as { storagePath: string }).storagePath.startsWith(`${auth.userId}/`) &&
      !(a as { storagePath: string }).storagePath.includes(".."))
    .slice(0, 200);
  try {
    return NextResponse.json({ urls: await signedMediaUrls(own) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
