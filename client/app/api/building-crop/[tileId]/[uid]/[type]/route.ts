/**
 * Redirects to the pre-cropped building image in object storage at
 * crops/{uid}/{type}.png.
 *
 * GET /api/building-crop/[tileId]/[uid]/[type]
 *   tileId is accepted but unused — the output folder is keyed by uid only.
 *   type = "pre" | "post"
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { buildDataObjectUrl } from "@/lib/server/remote-data";

const CROPS_DIR = path.join(process.cwd(), "..", "output", "crops");

type Params = { tileId: string; uid: string; type: string };

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<Params> },
) {
    const { uid, type } = await params;

    if (type !== "pre" && type !== "post") {
        return new NextResponse("Invalid type", { status: 400 });
    }

    // Prefer remote object storage if configured.
    // Keeps local dev working even when ./output/crops is not present.
    try {
        const remotePath = `crops/${uid}/${type}.png`;
        const remoteUrl = buildDataObjectUrl(remotePath);
        const upstream = await fetch(remoteUrl, { cache: "force-cache" });

        if (upstream.ok) {
            const bytes = await upstream.arrayBuffer();
            return new NextResponse(new Uint8Array(bytes), {
                status: 200,
                headers: {
                    "Content-Type": upstream.headers.get("content-type") ?? "image/png",
                    "Cache-Control": "public, max-age=86400",
                },
            });
        }
    } catch {
        // Fall back to local files if remote storage is not configured.
    }

    const filePath = path.join(CROPS_DIR, uid, `${type}.png`);

    if (!fs.existsSync(filePath)) {
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
