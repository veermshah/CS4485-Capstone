/**
 * Slippy tile server for pre- and post-disaster satellite imagery.
 *
 * Route: GET /api/tiles/[type]/[z]/[x]/[y]
 *   type  = "pre" | "post"
 *   z/x/y = standard Web Mercator tile coordinates
 *
 * Only zoom levels 16-18 are processed (source imagery is ~0.47 m/px which
 * aligns to zoom 18 at this latitude). Mapbox overzooms above 18 client-side.
 *
 * For each request the server:
 *   1. Finds source PNGs whose AABB overlaps the requested tile's bbox.
 *   2. For each overlapping source, crops the relevant pixel region.
 *   3. Composites all crops onto a transparent 256×256 output canvas.
 *   4. Returns the result as image/png.
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { findOverlappingTiles, type TileCorners } from "@/lib/server/tile-metadata";

const TILE_SIZE = 256;
const SOURCE_SIZE = 1024;
const MIN_ZOOM = 16;
const MAX_ZOOM = 18;

type Params = { type: string; z: string; x: string; y: string };

// In-memory tile cache: key → PNG buffer
const tileCache = new Map<string, Buffer>();

// A 256×256 fully-transparent PNG returned for tiles with no data.
// Generated once and reused — Mapbox decodes it cleanly and renders nothing.
let _emptyTile: Buffer | null = null;
async function emptyTile(): Promise<Buffer> {
  if (_emptyTile) return _emptyTile;
  _emptyTile = await sharp({
    create: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  return _emptyTile;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { type, z: zStr, x: xStr, y: yStr } = await params;

  if (type !== "pre" && type !== "post") {
    return new NextResponse("Invalid type", { status: 400 });
  }

  const z = parseInt(zStr, 10);
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  if (isNaN(z) || isNaN(x) || isNaN(y) || z < MIN_ZOOM || z > MAX_ZOOM) {
    return pngResponse(await emptyTile());
  }

  const cacheKey = `${type}/${z}/${x}/${y}`;
  if (tileCache.has(cacheKey)) {
    const cached = tileCache.get(cacheKey)!;
    return pngResponse(cached);
  }

  const overlapping = findOverlappingTiles(type, z, x, y);
  if (!overlapping.length) {
    return pngResponse(await emptyTile());
  }

  // Geographic bbox of the requested Mapbox tile
  const west = tile2lng(x, z);
  const east = tile2lng(x + 1, z);
  const north = tile2lat(y, z);
  const south = tile2lat(y + 1, z);

  // Build composite layers
  const composites: sharp.OverlayOptions[] = [];

  for (const source of overlapping) {
    const crop = computeSourceCrop(source.corners, west, east, north, south);
    if (!crop) continue;

    const { srcLeft, srcTop, srcWidth, srcHeight, dstLeft, dstTop, dstWidth, dstHeight } = crop;

    if (srcWidth < 1 || srcHeight < 1 || dstWidth < 1 || dstHeight < 1) continue;

    try {
      const cropped = await sharp(source.imagePath)
        .extract({
          left: Math.max(0, Math.round(srcLeft)),
          top: Math.max(0, Math.round(srcTop)),
          width: Math.min(SOURCE_SIZE - Math.max(0, Math.round(srcLeft)), Math.round(srcWidth)),
          height: Math.min(SOURCE_SIZE - Math.max(0, Math.round(srcTop)), Math.round(srcHeight)),
        })
        .resize(Math.round(dstWidth), Math.round(dstHeight), { fit: "fill" })
        .png()
        .toBuffer();

      composites.push({
        input: cropped,
        left: Math.max(0, Math.round(dstLeft)),
        top: Math.max(0, Math.round(dstTop)),
      });
    } catch {
      // Skip this source if there's a read/crop error
    }
  }

  if (!composites.length) {
    return pngResponse(await emptyTile());
  }

  const output = await sharp({
    create: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  tileCache.set(cacheKey, output);

  return pngResponse(output);
}

function pngResponse(buf: Buffer) {
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

/**
 * Given a source tile's geographic corners and the requested tile's bbox,
 * compute what pixel region to extract from the source PNG and where to
 * place it on the 256×256 output canvas.
 */
function computeSourceCrop(
  corners: TileCorners,
  west: number,
  east: number,
  north: number,
  south: number,
) {
  // Build inverse affine: (lng, lat) → (pixel_x, pixel_y)
  // Using the four corners of the source tile as control points.
  // For a north-up rectilinear image this is a simple linear mapping.
  const tl = corners.topLeft;     // pixel (0,    0)
  const tr = corners.topRight;    // pixel (1024, 0)
  const bl = corners.bottomLeft;  // pixel (0,    1024)

  // Compute affine coefficients: px = a*lng + b*lat + c, py = d*lng + e*lat + f
  const dLngH = tr[0] - tl[0]; // change in lng from left to right
  const dLatH = tr[1] - tl[1]; // change in lat from left to right (should be ~0)
  const dLngV = bl[0] - tl[0]; // change in lng from top to bottom (should be ~0)
  const dLatV = bl[1] - tl[1]; // change in lat from top to bottom (negative)

  const det = dLngH * dLatV - dLatH * dLngV;
  if (Math.abs(det) < 1e-15) return null;

  // Inverse affine coefficients
  const a = dLatV / det;
  const b = -dLngV / det;
  const d = -dLatH / det;
  const e = dLngH / det;

  const geoToPixel = (lng: number, lat: number): [number, number] => {
    const dlng = lng - tl[0];
    const dlat = lat - tl[1];
    // Multiply by SOURCE_SIZE: the inverse affine returns fractional coords (0→1),
    // but sharp.extract needs actual pixel coords (0→1024).
    return [
      (a * dlng + b * dlat) * SOURCE_SIZE,
      (d * dlng + e * dlat) * SOURCE_SIZE,
    ];
  };

  // Map the 4 corners of the requested tile to source pixel coords
  const [nwPx, nwPy] = geoToPixel(west, north);
  const [nePx, nePy] = geoToPixel(east, north);
  const [swPx, swPy] = geoToPixel(west, south);
  const [sePx, sePy] = geoToPixel(east, south);

  const pxMin = Math.min(nwPx, nePx, swPx, sePx);
  const pxMax = Math.max(nwPx, nePx, swPx, sePx);
  const pyMin = Math.min(nwPy, nePy, swPy, sePy);
  const pyMax = Math.max(nwPy, nePy, swPy, sePy);

  // Clamp to source image bounds
  const clampedLeft = Math.max(0, pxMin);
  const clampedTop = Math.max(0, pyMin);
  const clampedRight = Math.min(SOURCE_SIZE, pxMax);
  const clampedBottom = Math.min(SOURCE_SIZE, pyMax);

  if (clampedRight <= clampedLeft || clampedBottom <= clampedTop) return null;

  const srcWidth = clampedRight - clampedLeft;
  const srcHeight = clampedBottom - clampedTop;

  // Map source pixel overlap back to output tile pixel coords
  const totalPxRange = pxMax - pxMin;
  const totalPyRange = pyMax - pyMin;

  const dstLeft = ((clampedLeft - pxMin) / totalPxRange) * TILE_SIZE;
  const dstTop = ((clampedTop - pyMin) / totalPyRange) * TILE_SIZE;
  const dstWidth = (srcWidth / totalPxRange) * TILE_SIZE;
  const dstHeight = (srcHeight / totalPyRange) * TILE_SIZE;

  return {
    srcLeft: clampedLeft,
    srcTop: clampedTop,
    srcWidth,
    srcHeight,
    dstLeft,
    dstTop,
    dstWidth,
    dstHeight,
  };
}

function tile2lng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
