/**
 * Redirects to the full 1024x1024 source PNG for a given tile and disaster type
 * in object storage.
 *
 * GET /api/source-image/[tileId]/[type]
 *   tileId = zero-padded 8-digit tile number (e.g. "00000000")
 *   type   = "pre" | "post"
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDataObjectUrl } from "@/lib/server/remote-data";

type Params = { tileId: string; type: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { tileId, type } = await params;

  if (type !== "pre" && type !== "post") {
    return new NextResponse("Invalid type", { status: 400 });
  }

  // Sanitise tileId: must be digits only
  if (!/^\d+$/.test(tileId)) {
    return new NextResponse("Invalid tileId", { status: 400 });
  }

  const filename = `images/santa-rosa-wildfire_${tileId}_${type}_disaster.png`;
  const targetUrl = buildDataObjectUrl(filename);
  return NextResponse.redirect(targetUrl, { status: 307 });
}
