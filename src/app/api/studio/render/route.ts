import { NextResponse, type NextRequest } from "next/server";
import { rememberBaseUrl, startRender } from "@/lib/render/engine";
import { authorizeRender, requestOrigin } from "./auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lance le rendu MP4 d'un projet : POST { project_id } → { render_id }. */
export async function POST(request: NextRequest) {
  const auth = await authorizeRender(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  rememberBaseUrl(requestOrigin(request));
  const body = (await request.json().catch(() => ({}))) as { project_id?: unknown };
  if (typeof body.project_id !== "string" || !body.project_id) {
    return NextResponse.json({ error: "project_id requis." }, { status: 400 });
  }
  try {
    const job = await startRender(body.project_id);
    if (job.userId !== auth.userId && auth.userId) {
      return NextResponse.json({ error: "Projet d'un autre utilisateur." }, { status: 403 });
    }
    return NextResponse.json({ render_id: job.id, status: job.status, frames: job.frames }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
