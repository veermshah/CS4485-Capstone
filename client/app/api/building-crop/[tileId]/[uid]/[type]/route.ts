/**
 * Serves a pre-cropped building image for a building UID.
 *
 * Resolution order:
 *  1) Local file: output/crops/{uid}/{type}.png
 *  2) Remote object storage: {CROPS_PUBLIC_BASE_URL}/firelens-data/crops/{uid}/{type}.png
 *     (or {CROPS_PUBLIC_BASE_URL}/crops/{uid}/{type}.png if base already ends
 *      with "firelens-data")
 *
 * GET /api/building-crop/[tileId]/[uid]/[type]
 *   tileId is accepted but unused — the output folder is keyed by uid only.
 *   type = "pre" | "post"
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CROPS_DIR = path.join(process.cwd(), "..", "output", "crops");
const CROPS_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

type Params = { tileId: string; uid: string; type: string };

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<Params> },
) {
    const { uid, type } = await params;

    if (type !== "pre" && type !== "post") {
        return new NextResponse("Invalid type", { status: 400 });
    }

    const filePath = path.join(CROPS_DIR, uid, `${type}.png`);

  if (!fs.existsSync(filePath)) {
    const remoteCrop = await fetchRemoteCrop(uid, type);
    if (remoteCrop) return remoteCrop;
    return new NextResponse("Not found", { status: 404 });
  }

    const buffer = fs.readFileSync(filePath);

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
        },
    });
}

async function fetchRemoteCrop(uid: string, type: "pre" | "post"): Promise<NextResponse | null> {
  const base = CROPS_PUBLIC_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) return null;

  const keyPrefix = base.endsWith("/firelens-data") || base.endsWith("firelens-data")
    ? "crops"
    : "firelens-data/crops";
  const url = `${base}/${keyPrefix}/${encodeURIComponent(uid)}/${type}.png`;

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await response.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return null;
  }
}
