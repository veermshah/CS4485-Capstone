/**
 * Returns a GeoJSON FeatureCollection of all building polygons parsed from
 * the post-disaster xBD label JSON files.
 *
 * Each feature carries:
 *   uid          – unique building identifier from the dataset
 *   damage_class – normalised damage class matching map-panel colour scheme
 *   subtype      – raw xBD subtype string
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LABELS_DIR = path.join(process.cwd(), "..", "data", "labels");

type XbdFeature = {
  properties: { feature_type: string; subtype: string; uid: string };
  wkt: string;
};

type XbdLabel = {
  features: { lng_lat: XbdFeature[] };
};

const SUBTYPE_TO_DAMAGE: Record<string, string> = {
  "no-damage": "no_damage",
  "minor-damage": "minor",
  "major-damage": "major",
  "destroyed": "destroyed",
  "un-classified": "no_damage",
};

/** Parse a WKT POLYGON string into a GeoJSON coordinate ring. */
function wktPolygonToCoords(wkt: string): number[][][] | null {
  const match = wkt.match(/POLYGON\s*\(\(([^)]+)\)\)/);
  if (!match) return null;

  const ring = match[1]
    .trim()
    .split(",")
    .map((pair) => {
      const parts = pair.trim().split(/\s+/);
      return [parseFloat(parts[0]), parseFloat(parts[1])];
    })
    .filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));

  if (ring.length < 4) return null;
  return [ring];
}

// Module-level cache
let _geojsonCache: string | null = null;

export async function GET() {
  if (_geojsonCache) {
    return new NextResponse(_geojsonCache, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const files = fs.readdirSync(LABELS_DIR).filter((f) =>
    f.endsWith("_post_disaster.json"),
  );

  const features: object[] = [];

  for (const file of files) {
    // Extract the 8-digit tile ID from the filename
    const tileMatch = file.match(/santa-rosa-wildfire_(\d+)_post_disaster\.json$/);
    const tileId = tileMatch ? tileMatch[1] : "";

    let raw: XbdLabel;
    try {
      raw = JSON.parse(
        fs.readFileSync(path.join(LABELS_DIR, file), "utf8"),
      ) as XbdLabel;
    } catch {
      continue;
    }

    for (const feat of raw.features?.lng_lat ?? []) {
      if (feat.properties.feature_type !== "building") continue;

      const coords = wktPolygonToCoords(feat.wkt);
      if (!coords) continue;

      const subtype = feat.properties.subtype ?? "un-classified";
      const damageClass = SUBTYPE_TO_DAMAGE[subtype] ?? "no_damage";

      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: coords },
        properties: {
          uid: feat.properties.uid,
          tile_id: tileId,
          subtype,
          damage_class: damageClass,
          // building_id mirrors the uid so existing map-panel click/hover logic works
          building_id: feat.properties.uid,
          confidence: 1,
        },
      });
    }
  }

  const geojson = JSON.stringify({
    type: "FeatureCollection",
    features,
  });

  _geojsonCache = geojson;

  return new NextResponse(geojson, {
    headers: { "Content-Type": "application/json" },
  });
}
