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
  kind: "address" | "cluster" | "unsafe" | "building";
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
const LEAST_DAMAGED_INTENT = /\b(least|minimal|lowest|least.damage|minimal.damage|lowest.damage|undamaged|no.damage|minimum)\b/i;
const UNSAFE_INTENT = /\b(unsafe|destroyed|condemn|collapse|list.*destroyed|list.*unsafe)\b/i;
const PLACE_INTENT = /\b(neighborhood|neighbourhood|district|city|town|village|area|region|county|borough|downtown|uptown|midtown)\b/i;
const UID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

type LocationInfo = {
  full_address: string | null;
  name: string | null;
  neighborhood: string | null;
  place: string | null;
  district: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  address_accuracy: string | null;
};

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

  if (LEAST_DAMAGED_INTENT.test(message)) {
    const least = leastDamageHotspotDigest(buildings);
    blocks.push(least.prompt);
    focus ??= least.focus;
  } else if (CLUSTER_INTENT.test(message)) {
    const hotspot = severeHotspotDigest(buildings);
    blocks.push(hotspot.prompt);
    focus ??= hotspot.focus;
  }

  if (UNSAFE_INTENT.test(message)) {
    const unsafe = destroyedSampleDigest(buildings);
    blocks.push(unsafe.prompt);
    focus ??= unsafe.focus;
  }

  const nearby = await locationDigestForMessage(message, buildings);
  if (nearby) {
    blocks.push(nearby.prompt);
    focus ??= nearby.focus;
  }

  return { prompt: blocks.join("\n\n"), focus };
}

export async function buildSelectedBuildingContext(
  buildingId: string,
  baseUrl: string,
): Promise<SpatialContextResult | null> {
  const fc = await getBuildingsCached(baseUrl);
  if (!fc || !fc.features.length) return null;

  const feature = fc.features.find(
    (f) => f.properties.building_id === buildingId || f.properties.uid === buildingId,
  );
  if (!feature) return null;

  const props = feature.properties;
  const centroid = resolveCentroid(props, feature.geometry?.coordinates?.[0]);
  const locationInfo = centroid
    ? await fetchLocationInfo(baseUrl, centroid.lat, centroid.lng)
    : null;

  const lines: string[] = ["Selected building context:"];
  lines.push(`  building_id: ${props.building_id ?? buildingId}`);
  if (props.uid && props.uid !== props.building_id) {
    lines.push(`  uid: ${props.uid}`);
  }
  if (props.tile_id) {
    lines.push(`  tile_id: ${props.tile_id}`);
  }
  if (props.damage_class) {
    lines.push(`  damage_class: ${props.damage_class}`);
  }
  if (props.subtype) {
    lines.push(`  subtype: ${props.subtype}`);
  }
  if (typeof props.confidence === "number") {
    lines.push(`  confidence: ${props.confidence.toFixed(2)}`);
  }
  if (centroid) {
    lines.push(`  centroid: (${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)})`);
  }

  if (locationInfo?.full_address) {
    lines.push(`  address: ${locationInfo.full_address}`);
  }
  if (locationInfo?.name) {
    lines.push(`  place_name: ${locationInfo.name}`);
  }
  if (locationInfo?.neighborhood) {
    lines.push(`  neighborhood: ${locationInfo.neighborhood}`);
  }
  if (locationInfo?.place) {
    lines.push(`  city: ${locationInfo.place}`);
  }
  if (locationInfo?.district) {
    lines.push(`  district: ${locationInfo.district}`);
  }
  if (locationInfo?.region) {
    lines.push(`  region: ${locationInfo.region}`);
  }
  if (locationInfo?.postcode) {
    lines.push(`  postcode: ${locationInfo.postcode}`);
  }
  if (locationInfo?.country) {
    lines.push(`  country: ${locationInfo.country}`);
  }
  if (locationInfo?.address_accuracy) {
    lines.push(`  address_accuracy: ${locationInfo.address_accuracy}`);
  }

  const focus = centroid
    ? {
        kind: "building" as const,
        center: { lng: centroid.lng, lat: centroid.lat },
        zoom: 18,
        building_ids: [props.building_id ?? buildingId],
        label: locationInfo?.full_address ?? props.building_id ?? buildingId,
      }
    : null;

  return { prompt: lines.join("\n"), focus };
}

export async function buildUidLookupContext(
  message: string,
  baseUrl: string,
): Promise<SpatialContextResult | null> {
  const uids = extractUids(message);
  if (!uids.length) return null;

  const fc = await getBuildingsCached(baseUrl);
  if (!fc || !fc.features.length) {
    return {
      prompt: "Uid lookup: building dataset unavailable.",
      focus: null,
    };
  }

  const lines: string[] = ["Uid lookup results:"];
  let focus: SpatialFocus | null = null;

  const maxLookups = 3;
  const lookups = uids.slice(0, maxLookups);

  for (const uid of lookups) {
    const feature = fc.features.find(
      (f) => f.properties.uid === uid || f.properties.building_id === uid,
    );
    if (!feature) {
      lines.push(`  uid ${uid}: not found in building dataset`);
      continue;
    }

    const props = feature.properties;
    const centroid = resolveCentroid(props, feature.geometry?.coordinates?.[0]);
    const locationInfo = centroid
      ? await fetchLocationInfo(baseUrl, centroid.lat, centroid.lng)
      : null;

    lines.push(`  uid: ${uid}`);
    lines.push(`    building_id: ${props.building_id ?? uid}`);
    if (props.damage_class) {
      lines.push(`    damage_class: ${props.damage_class}`);
    }
    if (centroid) {
      lines.push(`    centroid: (${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)})`);
    }
    if (locationInfo?.full_address) {
      lines.push(`    address: ${locationInfo.full_address}`);
    } else if (locationInfo?.name) {
      lines.push(`    place_name: ${locationInfo.name}`);
    }

    if (!focus && centroid) {
      focus = {
        kind: "building",
        center: { lng: centroid.lng, lat: centroid.lat },
        zoom: 18,
        building_ids: [props.building_id ?? uid],
        label: locationInfo?.full_address ?? props.building_id ?? uid,
      };
    }
  }

  if (uids.length > maxLookups) {
    lines.push(`  ...plus ${uids.length - maxLookups} more uid(s)`);
  }

  return { prompt: lines.join("\n"), focus };
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

function extractUids(message: string): string[] {
  const matches = message.match(UID_PATTERN) ?? [];
  return Array.from(new Set(matches.map((uid) => uid.toLowerCase())));
}

function resolveCentroid(
  props: RealBuilding,
  ring: number[][] | undefined,
): { lat: number; lng: number } | null {
  if (typeof props.centroid_lat === "number" && typeof props.centroid_lng === "number") {
    return { lat: props.centroid_lat, lng: props.centroid_lng };
  }

  return deriveCentroidFromRing(ring);
}

function deriveCentroidFromRing(ring: number[][] | undefined): { lat: number; lng: number } | null {
  if (!ring?.length) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  const hasClosure = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  const points = hasClosure ? ring.slice(0, -1) : ring;
  if (!points.length) return null;

  const sum = points.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 },
  );

  return {
    lng: sum.lng / points.length,
    lat: sum.lat / points.length,
  };
}

async function fetchLocationInfo(
  baseUrl: string,
  lat: number,
  lng: number,
): Promise<LocationInfo | null> {
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/location-info?lat=${lat}&lng=${lng}`,
      { cache: "force-cache" },
    );
    if (!res.ok) return null;
    return (await res.json()) as LocationInfo;
  } catch {
    return null;
  }
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

function leastDamageHotspotDigest(buildings: BuildingLite[]): { prompt: string; focus: SpatialFocus | null } {
  if (!buildings.length) {
    return { prompt: "Least-damaged hotspots: no buildings available.", focus: null };
  }

  const LAT_BIN = 0.005;
  const LNG_BIN = 0.006;
  const MIN_CELL_COUNT = 8;

  const bins = new Map<string, BuildingLite[]>();
  for (const b of buildings) {
    const key = `${Math.floor(b.lat / LAT_BIN)},${Math.floor(b.lng / LNG_BIN)}`;
    const arr = bins.get(key) ?? [];
    arr.push(b);
    bins.set(key, arr);
  }

  const scored = Array.from(bins.values())
    .filter((cell) => cell.length >= MIN_CELL_COUNT)
    .map((cell) => {
      const counts = countByClass(cell);
      const total = cell.length;
      const severe = counts.major + counts.destroyed;
      const severeRatio = total ? severe / total : 1;
      const noDamageRatio = total ? counts.no_damage / total : 0;
      return { cell, counts, total, severeRatio, noDamageRatio };
    })
    .sort((a, b) =>
      a.severeRatio === b.severeRatio
        ? b.noDamageRatio - a.noDamageRatio
        : a.severeRatio - b.severeRatio,
    )
    .slice(0, 5);

  if (!scored.length) {
    return { prompt: "Least-damaged hotspots: not enough buildings per area.", focus: null };
  }

  const ranked = scored.map(({ cell, counts, total, severeRatio, noDamageRatio }) => {
    const c = centroid(cell);
    return `  - (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}): ${total} buildings | severe ${Math.round(severeRatio * 100)}% | no_damage ${Math.round(noDamageRatio * 100)}%`;
  });

  const top = scored[0];
  const topCentroid = centroid(top.cell);

  return {
    prompt: [
      "Least-damaged hotspots (~500 m grid cells, ranked by lowest severe ratio):",
      ...ranked,
      "These areas have the lowest severe-damage concentration in the dataset.",
    ].join("\n"),
    focus: topCentroid
      ? {
          kind: "cluster",
          center: { lng: topCentroid.lng, lat: topCentroid.lat },
          zoom: 16,
          building_ids: top.cell.slice(0, 10).map((b) => b.uid),
          label: "Least-damaged hotspot",
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

async function locationDigestForMessage(
  message: string,
  buildings: BuildingLite[],
): Promise<{ prompt: string; focus: SpatialFocus | null } | null> {
  if (ADDRESS_INTENT.test(message)) {
    const address = await nearbyDigestForAddress(message, buildings);
    if (address) return address;
  }

  const placeQuery = extractPlaceQuery(message);
  if (!placeQuery) return null;

  return await nearbyDigestForPlace(placeQuery, buildings);
}

async function nearbyDigestForPlace(
  query: string,
  buildings: BuildingLite[],
): Promise<{ prompt: string; focus: SpatialFocus | null } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("limit", "1");
  url.searchParams.set("proximity", "-122.694374,38.450821");
  url.searchParams.set("bbox", "-123.05,38.2,-122.35,38.7");
  url.searchParams.set("types", "neighborhood,locality,place,district,region,address,poi");
  url.searchParams.set("access_token", token);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "force-cache" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{ place_name?: string; center?: [number, number]; place_type?: string[] }>;
  };
  const feature = data.features?.[0];
  if (!feature?.center) return null;

  const [lng, lat] = feature.center;
  const placeType = feature.place_type?.[0];
  const radius = radiusForPlaceType(placeType);

  const within = buildings
    .map((b) => ({ b, d: haversine(lat, lng, b.lat, b.lng) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d);

  if (!within.length) {
    return {
      prompt: [
        `Place lookup: "${query}" → ${feature.place_name ?? "geocoded"} at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
        `No buildings in the dataset within ${radius} m of this area.`,
      ].join("\n"),
      focus: {
        kind: "address",
        center: { lng, lat },
        zoom: zoomForPlaceType(placeType),
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
      `Place lookup: "${query}" → ${feature.place_name ?? "geocoded"} at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
      `Buildings within ${radius} m: ${total}`,
      `  no_damage: ${counts.no_damage} | minor: ${counts.minor} | major: ${counts.major} | destroyed: ${counts.destroyed}`,
      "  Closest buildings:",
      ...closest,
    ].join("\n"),
    focus: {
      kind: "address",
      center: { lng, lat },
      zoom: zoomForPlaceType(placeType),
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

function extractPlaceQuery(message: string): string | null {
  const keywordMatch = message.match(
    /\b(?:in|near|around|at|within)\s+([A-Z][\w.\- ]{2,60})/,
  );
  if (keywordMatch) {
    const query = keywordMatch[1].trim();
    return query.length >= 3 ? query : null;
  }

  const labeled = message.match(
    /\b([A-Z][\w-]+(?:\s+[A-Z][\w-]+){0,3}\s+(?:neighborhood|neighbourhood|district|city|town|village|area|region|county|borough|downtown|uptown|midtown))\b/i,
  );
  if (labeled) {
    return labeled[1].trim();
  }

  if (!PLACE_INTENT.test(message)) return null;

  const fallback = message.match(
    /\b(?:neighborhood|neighbourhood|district|city|town|village|area|region|county|borough|downtown|uptown|midtown)\b[^?.!,;]*/i,
  );
  return fallback ? fallback[0].trim() : null;
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

function radiusForPlaceType(placeType: string | undefined): number {
  switch (placeType) {
    case "address":
    case "poi":
      return 300;
    case "neighborhood":
    case "locality":
      return 800;
    case "district":
      return 1500;
    case "place":
      return 2500;
    case "region":
      return 5000;
    default:
      return 1000;
  }
}

function zoomForPlaceType(placeType: string | undefined): number {
  switch (placeType) {
    case "address":
    case "poi":
      return 18;
    case "neighborhood":
    case "locality":
      return 15;
    case "district":
      return 14;
    case "place":
      return 13;
    case "region":
      return 11;
    default:
      return 15;
  }
}
