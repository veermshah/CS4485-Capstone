/**
 * Redirects to the pre-cropped building image in object storage at
 * crops/{uid}/{type}.png.
 *
 * GET /api/building-crop/[tileId]/[uid]/[type]
 *   tileId is accepted but unused — the output folder is keyed by uid only.
 *   type = "pre" | "post"
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDataObjectUrl } from "@/lib/server/remote-data";

type Params = { tileId: string; uid: string; type: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { uid, type } = await params;

  if (type !== "pre" && type !== "post") {
    return new NextResponse("Invalid type", { status: 400 });
  }

  const targetUrl = buildDataObjectUrl(`crops/${uid}/${type}.png`);
  return NextResponse.redirect(targetUrl, { status: 307 });
}
