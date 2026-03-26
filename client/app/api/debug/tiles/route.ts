/**
 * Debug endpoint — returns computed geographic corners for every source tile.
 * Visit http://localhost:3000/api/debug/tiles to inspect.
 *
 * DELETE THIS FILE before deploying to production.
 */

import { NextResponse } from "next/server";
import { getAllTileMetadata } from "@/lib/server/tile-metadata";

export async function GET() {
  const tiles = getAllTileMetadata();

  const summary = tiles.map((t) => ({
    id: t.id,
    pre: t.pre
      ? { corners: t.pre.corners, imagePath: t.pre.imagePath }
      : null,
    post: t.post
      ? { corners: t.post.corners, imagePath: t.post.imagePath }
      : null,
  }));

  const nullPost = summary.filter((t) => t.post === null).length;
  const nullPre  = summary.filter((t) => t.pre  === null).length;

  return NextResponse.json({
    total: tiles.length,
    nullPost,
    nullPre,
    tiles: summary,
  });
}
