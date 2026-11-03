import { NextResponse, type NextRequest } from "next/server";
import { finalizeUpload } from "@/lib/media/server";
import { authorizeRender } from "../../render/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Finalise un envoi : POST { project_id, asset_id, mime, name } → asset (mesuré, normalisé). */
export async function POST(request: NextRequest) {
  const auth = await authorizeRender(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { project_id, asset_id, mime, name } = body;
  if (typeof project_id !== "string" || typeof asset_id !== "string" || typeof mime !== "string") {
    return NextResponse.json({ error: "project_id, asset_id et mime requis." }, { status: 400 });
  }
  try {
    const asset = await finalizeUpload({
      userId: auth.userId,
      projectId: project_id,
      assetId: asset_id,
      mime,
      name: typeof name === "string" ? name : "média",
    });
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
