/**
 * Builds a "spatial context" block for the damage-assessment chatbot.
 *
 * The Python backend has only the evaluation CSV (uid + labels), so it cannot
 * answer geographic questions on its own. This module pulls the same building
 * GeoJSON the map uses, then for each user message it pre-computes a few
 * geo-aware summaries (severe-damage hotspots, nearby buildings for an
 * address mention, sample destroyed-building uids) and returns a plain-text
 * block that gets appended to the chatbot's prompt — same pattern as the
 * existing uid_context.
 */
import type { RealBuilding } from "@/lib/buildings";

type SpatialCenter = {
  lng: number;
  lat: number;
};

type SpatialFocus = {
  kind: "address" | "cluster" | "unsafe";
  center: SpatialCenter;
  zoom: number;
  building_ids: string[];
  label: string;
};

export type SpatialContextResult = {
  prompt: string;
  focus: SpatialFocus | null;
};

type Feature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: RealBuilding & { building_id: string };
};

type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

const BUILDINGS_TTL_MS = 10 * 60 * 1000;
let buildingsCache: { at: number; data: FeatureCollection | null } | null = null;

const ADDRESS_INTENT = /\b(?:\d{1,6}\s+\w+|street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|circle|cir\.?|highway|hwy\.?|place|pl\.?|parkway|pkwy\.?)\b/i;
const CLUSTER_INTENT = /\b(cluster|hotspot|concentrated|prioritize|priority|severe|severely|worst|most damaged|where.*(damage|damaged|destroyed)|areas?|neighborhood|zone|response|responder|unsafe|inspection|urgent)\b/i;
const UNSAFE_INTENT = /\b(unsafe|destroyed|condemn|collapse|list.*destroyed|list.*unsafe)\b/i;

export async function buildSpatialContext(
  message: string,
  baseUrl: string,
): Promise<SpatialContextResult | null> {
  const fc = await getBuildingsCached(baseUrl);
  if (!fc || !fc.features.length) return null;

  const buildings = fc.features
    .map(toLite)
    .filter((b): b is BuildingLite => b !== null);

  const blocks: string[] = [];
  let focus: SpatialFocus | null = null;

  // Always-on global digest so the model has accurate counts even on questions
  // that don't trigger a more specific lookup.
  blocks.push(globalDigest(buildings));

  if (CLUSTER_INTENT.test(message)) {
    const hotspot = severeHotspotDigest(buildings);
    blocks.push(hotspot.prompt);
    focus ??= hotspot.focus;
  }

  if (UNSAFE_INTENT.test(message)) {
    const unsafe = destroyedSampleDigest(buildings);
    blocks.push(unsafe.prompt);
    focus ??= unsafe.focus;
  }

  if (ADDRESS_INTENT.test(message)) {
    const nearby = await nearbyDigestForAddress(message, buildings);
    if (nearby) {
      blocks.push(nearby.prompt);
      focus ??= nearby.focus;
    }
  }

  return { prompt: blocks.join("\n\n"), focus };
}

// ─── Building lite type + GeoJSON loading ─────────────────────────────────

type BuildingLite = {
  uid: string;
  damage_class: RealBuilding["damage_class"];
  lng: number;
  lat: number;
};

function toLite(feat: Feature): BuildingLite | null {
  const p = feat.properties;
  const lng = p.centroid_lng;
  const lat = p.centroid_lat;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!p.uid || !p.damage_class) return null;
  return { uid: p.uid, damage_class: p.damage_class, lng, lat };
}

async function getBuildingsCached(baseUrl: string): Promise<FeatureCollection | null> {
  if (buildingsCache && Date.now() - buildingsCache.at < BUILDINGS_TTL_MS) {
    return buildingsCache.data;
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/buildings`, {
      cache: "no-store",
    });
    if (!res.ok) {
      buildingsCache = { at: Date.now(), data: null };
      return null;
    }
    const data = (await res.json()) as FeatureCollection;
    buildingsCache = { at: Date.now(), data };
    return data;
  } catch {
    buildingsCache = { at: Date.now(), data: null };
    return null;
  }
}

// ─── Digests ──────────────────────────────────────────────────────────────

function globalDigest(buildings: BuildingLite[]): string {
  const counts = countByClass(buildings);
  const total = buildings.length;
  const severe = counts.major + counts.destroyed;
  return [
    "Geographic dataset (post-disaster building footprints, with centroid lat/lng):",
    `  Total buildings with coordinates: ${total}`,
    `  no_damage: ${counts.no_damage} | minor: ${counts.minor} | major: ${counts.major} | destroyed: ${counts.destroyed}`,
    `  Severe (major+destroyed): ${severe} (${pct(severe, total)}%)`,
  ].join("\n");
}

function severeHotspotDigest(buildings: BuildingLite[]): { prompt: string; focus: SpatialFocus | null } {
  const severe = buildings.filter(
    (b) => b.damage_class === "major" || b.damage_class === "destroyed",
  );
  if (!severe.length) return { prompt: "Severe-damage hotspots: none.", focus: null };

  // Bin by ~500 m grid cells (roughly 0.005 deg lat, 0.006 deg lng at 38°N).
  const LAT_BIN = 0.005;
  const LNG_BIN = 0.006;
  const bins = new Map<string, BuildingLite[]>();
  for (const b of severe) {
    const key = `${Math.floor(b.lat / LAT_BIN)},${Math.floor(b.lng / LNG_BIN)}`;
    const arr = bins.get(key) ?? [];
    arr.push(b);
    bins.set(key, arr);
  }

  const ranked = Array.from(bins.values())
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .map((cell) => {
      const c = centroid(cell);
      const destroyed = cell.filter((b) => b.damage_class === "destroyed").length;
      const major = cell.length - destroyed;
      return `  - (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}): ${cell.length} severe (${destroyed} destroyed, ${major} major)`;
    });

  const topCell = Array.from(bins.values()).sort((a, b) => b.length - a.length)[0];
  const topCentroid = centroid(topCell);

  return {
    prompt: [
      "Top severe-damage hotspots (~500 m grid cells, ranked by severe count):",
      ...ranked,
      "These are the highest-priority areas for emergency response and inspection.",
    ].join("\n"),
    focus: topCentroid
      ? {
          kind: "cluster",
          center: { lng: topCentroid.lng, lat: topCentroid.lat },
          zoom: 16,
          building_ids: topCell.slice(0, 10).map((b) => b.uid),
          label: "Severe-damage hotspot",
        }
      : null,
  };
}

function destroyedSampleDigest(buildings: BuildingLite[]): { prompt: string; focus: SpatialFocus | null } {
  const destroyed = buildings.filter((b) => b.damage_class === "destroyed");
  if (!destroyed.length) return { prompt: "No destroyed buildings in the dataset.", focus: null };

  const sample = destroyed.slice(0, 10);
  const lines = sample.map(
    (b) => `  - uid ${b.uid} at (${b.lat.toFixed(5)}, ${b.lng.toFixed(5)})`,
  );
  const c = centroid(sample);
  return {
    prompt: [
      `Potentially unsafe buildings (sample of ${sample.length} of ${destroyed.length} destroyed):`,
      ...lines,
    ].join("\n"),
    focus: {
      kind: "unsafe",
      center: { lng: c.lng, lat: c.lat },
      zoom: 17,
      building_ids: sample.map((b) => b.uid),
      label: "Destroyed buildings sample",
    },
  };
}

async function nearbyDigestForAddress(
  message: string,
  buildings: BuildingLite[],
): Promise<{ prompt: string; focus: SpatialFocus | null } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const query = extractAddressQuery(message);
  if (!query) return null;

  // Bias the geocoder toward the Santa Rosa area covered by the dataset.
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("limit", "1");
  url.searchParams.set("proximity", "-122.694374,38.450821");
  url.searchParams.set("bbox", "-123.05,38.2,-122.35,38.7");
  url.searchParams.set("access_token", token);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "force-cache" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{ place_name?: string; center?: [number, number] }>;
  };
  const feature = data.features?.[0];
  if (!feature?.center) return null;

  const [lng, lat] = feature.center;
  const RADIUS_M = 300;
  const within = buildings
    .map((b) => ({ b, d: haversine(lat, lng, b.lat, b.lng) }))
    .filter(({ d }) => d <= RADIUS_M)
    .sort((a, b) => a.d - b.d);

  if (!within.length) {
    return {
      prompt: [
        `Address lookup: "${query}" → ${feature.place_name ?? "geocoded"} at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
        `No buildings in the dataset within ${RADIUS_M} m of this address.`,
      ].join("\n"),
      focus: {
        kind: "address",
        center: { lng, lat },
        zoom: 18,
        building_ids: [],
        label: feature.place_name ?? query,
      },
    };
  }

  const counts = countByClass(within.map(({ b }) => b));
  const total = within.length;
  const closest = within.slice(0, 5).map(({ b, d }) =>
    `    - uid ${b.uid}: ${b.damage_class} (${Math.round(d)} m away)`,
  );

  return {
    prompt: [
      `Address lookup: "${query}" → ${feature.place_name ?? "geocoded"} at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
      `Buildings within ${RADIUS_M} m: ${total}`,
      `  no_damage: ${counts.no_damage} | minor: ${counts.minor} | major: ${counts.major} | destroyed: ${counts.destroyed}`,
      `  Closest buildings:`,
      ...closest,
    ].join("\n"),
    focus: {
      kind: "address",
      center: { lng, lat },
      zoom: 18,
      building_ids: within.slice(0, 10).map(({ b }) => b.uid),
      label: feature.place_name ?? query,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractAddressQuery(message: string): string | null {
  // Pull a phrase that looks like an address or street name. Strip leading
  // verbs/prepositions that confuse the geocoder ("at 123 Main St" → "123 Main St").
  const m = message.match(
    /(?:\d{1,6}\s+[\w.\- ]+?(?:street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|circle|cir\.?|highway|hwy\.?|place|pl\.?|parkway|pkwy\.?)\b|[A-Z][\w\-]+(?:\s+[A-Z][\w\-]+)?\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Highway|Hwy\.?|Place|Pl\.?|Parkway|Pkwy\.?))/,
  );
  return m ? m[0].trim() : null;
}

function countByClass(buildings: BuildingLite[]) {
  const counts = { no_damage: 0, minor: 0, major: 0, destroyed: 0 };
  for (const b of buildings) counts[b.damage_class] += 1;
  return counts;
}

function centroid(buildings: BuildingLite[]): { lat: number; lng: number } {
  const sum = buildings.reduce(
    (acc, b) => ({ lat: acc.lat + b.lat, lng: acc.lng + b.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / buildings.length, lng: sum.lng / buildings.length };
}

function pct(part: number, total: number): string {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
