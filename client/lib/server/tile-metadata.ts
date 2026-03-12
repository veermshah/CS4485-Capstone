/**
 * Parses xBD label JSONs to compute the geographic bounding corners of each
 * 1024×1024 source tile using a least-squares affine transform fitted from
 * building pixel↔lng_lat coordinate pairs.
 *
 * Results are module-level cached so the filesystem is only read once per
 * server process lifetime.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");
const LABELS_DIR = path.join(DATA_DIR, "labels");
const IMAGES_DIR = path.join(DATA_DIR, "images");

export type TileCorners = {
  topLeft: [number, number]; // [lng, lat]
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
};

export type TileMetadata = {
  id: string;
  pre: { imagePath: string; corners: TileCorners } | null;
  post: { imagePath: string; corners: TileCorners } | null;
};

type XbdFeature = {
  properties: { feature_type: string; subtype: string; uid: string };
  wkt: string;
};

type XbdLabel = {
  features: {
    lng_lat: XbdFeature[];
    xy: XbdFeature[];
  };
  metadata: {
    img_name: string;
    original_width: number;
    original_height: number;
  };
};

/** Parse the first coordinate pair from a WKT POLYGON string. */
function parseFirstVertex(wkt: string): [number, number] | null {
  const match = wkt.match(/POLYGON\s*\(\(([^)]+)/);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) return null;
  return [parseFloat(parts[0]), parseFloat(parts[1])];
}

/**
 * Fit an affine transform mapping pixel (x, y) → (lng, lat) using
 * least-squares regression over N control point pairs.
 *
 * Model:
 *   lng = a·x + b·y + c
 *   lat = d·x + e·y + f
 *
 * Returns a function that maps pixel coords to [lng, lat].
 */
function fitAffineTransform(
  pixelPts: [number, number][],
  geoPts: [number, number][],
): ((px: number, py: number) => [number, number]) | null {
  const n = pixelPts.length;
  if (n < 3) return null;

  // Build the normal equations for least squares: A^T A x = A^T b
  // A row: [px, py, 1]
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, sumYY = 0;
  let sumXLng = 0, sumYLng = 0, sumLng = 0;
  let sumXLat = 0, sumYLat = 0, sumLat = 0;

  for (let i = 0; i < n; i++) {
    const [px, py] = pixelPts[i];
    const [lng, lat] = geoPts[i];
    sumX += px; sumY += py;
    sumXX += px * px; sumXY += px * py; sumYY += py * py;
    sumXLng += px * lng; sumYLng += py * lng; sumLng += lng;
    sumXLat += px * lat; sumYLat += py * lat; sumLat += lat;
  }

  // Solve 3×3 system: [[sumXX, sumXY, sumX], [sumXY, sumYY, sumY], [sumX, sumY, n]]
  const M = [
    [sumXX, sumXY, sumX],
    [sumXY, sumYY, sumY],
    [sumX,  sumY,  n],
  ];
  const bLng = [sumXLng, sumYLng, sumLng];
  const bLat = [sumXLat, sumYLat, sumLat];

  const sol = (M: number[][], b: number[]): number[] | null => {
    // Gaussian elimination with partial pivoting
    const n = b.length;
    const aug = M.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-12) return null;
      for (let row = col + 1; row < n; row++) {
        const f = aug[row][col] / aug[col][col];
        for (let k = col; k <= n; k++) aug[row][k] -= f * aug[col][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n];
      for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
      x[i] /= aug[i][i];
    }
    return x;
  };

  const lngCoeffs = sol(M, bLng);
  const latCoeffs = sol(M, bLat);
  if (!lngCoeffs || !latCoeffs) return null;

  const [a, b, c] = lngCoeffs;
  const [d, e, f] = latCoeffs;

  return (px: number, py: number): [number, number] => [
    a * px + b * py + c,
    d * px + e * py + f,
  ];
}

function computeCorners(labelPath: string): TileCorners | null {
  let raw: XbdLabel;
  try {
    raw = JSON.parse(fs.readFileSync(labelPath, "utf8")) as XbdLabel;
  } catch {
    return null;
  }

  const lngLatFeatures = raw.features?.lng_lat ?? [];
  const xyFeatures = raw.features?.xy ?? [];

  if (lngLatFeatures.length < 3 || xyFeatures.length < 3) return null;

  const pixelPts: [number, number][] = [];
  const geoPts: [number, number][] = [];

  const limit = Math.min(lngLatFeatures.length, xyFeatures.length, 50);
  for (let i = 0; i < limit; i++) {
    const geo = parseFirstVertex(lngLatFeatures[i].wkt);
    const pix = parseFirstVertex(xyFeatures[i].wkt);
    if (geo && pix) {
      pixelPts.push(pix);
      geoPts.push(geo);
    }
  }

  const transform = fitAffineTransform(pixelPts, geoPts);
  if (!transform) return null;

  const w = raw.metadata?.original_width ?? 1024;
  const h = raw.metadata?.original_height ?? 1024;

  return {
    topLeft: transform(0, 0),
    topRight: transform(w, 0),
    bottomRight: transform(w, h),
    bottomLeft: transform(0, h),
  };
}

// Module-level cache — populated once per server process
let _cache: TileMetadata[] | null = null;

export function getAllTileMetadata(): TileMetadata[] {
  if (_cache) return _cache;

  const files = fs.readdirSync(LABELS_DIR);

  // Collect unique tile IDs
  const ids = new Set<string>();
  for (const f of files) {
    const m = f.match(/^santa-rosa-wildfire_(\d+)_(?:pre|post)_disaster\.json$/);
    if (m) ids.add(m[1]);
  }

  _cache = Array.from(ids).map((id): TileMetadata => {
    const preLabel = path.join(LABELS_DIR, `santa-rosa-wildfire_${id}_pre_disaster.json`);
    const postLabel = path.join(LABELS_DIR, `santa-rosa-wildfire_${id}_post_disaster.json`);
    const preImage = path.join(IMAGES_DIR, `santa-rosa-wildfire_${id}_pre_disaster.png`);
    const postImage = path.join(IMAGES_DIR, `santa-rosa-wildfire_${id}_post_disaster.png`);

    const preCorners  = fs.existsSync(preLabel)  ? computeCorners(preLabel)  : null;
    const postCorners = fs.existsSync(postLabel) ? computeCorners(postLabel) : null;

    // If one label file has too few buildings to fit the affine transform,
    // fall back to the other's corners — pre and post cover the same area.
    const corners = preCorners ?? postCorners;

    return {
      id,
      pre:  corners && fs.existsSync(preImage)  ? { imagePath: preImage,  corners } : null,
      post: corners && fs.existsSync(postImage) ? { imagePath: postImage, corners } : null,
    };
  });

  return _cache;
}

/**
 * Find all source tiles (for `type`) whose bounding box overlaps a given
 * Web Mercator tile specified by z/x/y.
 */
export function findOverlappingTiles(
  type: "pre" | "post",
  z: number,
  x: number,
  y: number,
): { imagePath: string; corners: TileCorners }[] {
  const west = tile2lng(x, z);
  const east = tile2lng(x + 1, z);
  const north = tile2lat(y, z);
  const south = tile2lat(y + 1, z);

  const all = getAllTileMetadata();
  const results: { imagePath: string; corners: TileCorners }[] = [];

  for (const tile of all) {
    const entry = type === "pre" ? tile.pre : tile.post;
    if (!entry) continue;

    const { corners } = entry;
    const lngs = [corners.topLeft[0], corners.topRight[0], corners.bottomRight[0], corners.bottomLeft[0]];
    const lats = [corners.topLeft[1], corners.topRight[1], corners.bottomRight[1], corners.bottomLeft[1]];
    const tileWest = Math.min(...lngs);
    const tileEast = Math.max(...lngs);
    const tileSouth = Math.min(...lats);
    const tileNorth = Math.max(...lats);

    // AABB overlap check
    if (tileEast <= west || tileWest >= east || tileNorth <= south || tileSouth >= north) {
      continue;
    }

    results.push(entry);
  }

  return results;
}

function tile2lng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
