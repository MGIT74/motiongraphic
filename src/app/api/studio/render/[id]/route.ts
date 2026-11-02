import { NextResponse, type NextRequest } from "next/server";
import { getRender } from "@/lib/render/engine";
import { authorizeRender } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État d'un rendu : { status, progress, url? }. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRender(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const job = await getRender(id);
  if (!job || (auth.userId && job.userId !== auth.userId)) return NextResponse.json({ error: "Rendu introuvable." }, { status: 404 });
  return NextResponse.json({
    render_id: job.id,
    project_id: job.projectId,
    status: job.status,
    progress: Math.round(job.progress * 100),
    frames: job.frames,
    frames_done: job.framesDone,
    url: job.url ?? null,
    size_bytes: job.sizeBytes ?? null,
    error: job.error ?? null,
  });
}
