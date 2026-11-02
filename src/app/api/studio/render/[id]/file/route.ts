import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { localRenderFile } from "@/lib/render/engine";
import { verifyRenderToken } from "@/lib/render/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Téléchargement de secours d'un MP4 rendu (lien signé), si Supabase Storage est indisponible. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyRenderToken("file", id, request.nextUrl.searchParams.get("k"))) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 403 });
  }
  const file = localRenderFile(id);
  if (!file) return NextResponse.json({ error: "Fichier expiré ou introuvable." }, { status: 404 });
  const { size } = await stat(file);
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="motiongraphic-${id.slice(0, 8)}.mp4"`,
    },
  });
}
