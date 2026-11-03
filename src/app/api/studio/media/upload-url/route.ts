import { NextResponse, type NextRequest } from "next/server";
import { createUploadTicket } from "@/lib/media/server";
import { authorizeRender } from "../../render/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** URL d'envoi signée : POST { project_id, mime, size } → { asset_id, signed_url, token }. */
export async function POST(request: NextRequest) {
  const auth = await authorizeRender(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as { project_id?: unknown; mime?: unknown; size?: unknown };
  if (typeof body.project_id !== "string" || typeof body.mime !== "string") {
    return NextResponse.json({ error: "project_id et mime requis." }, { status: 400 });
  }
  try {
    const ticket = await createUploadTicket(auth.userId, body.project_id, body.mime, Number(body.size));
    return NextResponse.json({ asset_id: ticket.assetId, path: ticket.path, signed_url: ticket.signedUrl, token: ticket.token });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
