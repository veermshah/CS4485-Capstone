/**
 * Serves the full 1024×1024 source PNG for a given tile and disaster type.
 *
 * GET /api/source-image/[tileId]/[type]
 *   tileId = zero-padded 8-digit tile number (e.g. "00000000")
 *   type   = "pre" | "post"
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "..", "data", "images");

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

  const filename = `santa-rosa-wildfire_${tileId}_${type}_disaster.png`;
  const filePath = path.join(IMAGES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
