import { NextRequest, NextResponse } from "next/server";

type ContextItem = {
  id?: string;
  text?: string;
  short_code?: string;
};

type MapboxFeature = {
  id?: string;
  place_name?: string;
  text?: string;
  place_type?: string[];
  center?: [number, number];
  relevance?: number;
  properties?: {
    accuracy?: string;
  };
  context?: ContextItem[];
};

type MapboxReverseResponse = {
  features?: MapboxFeature[];
};

type LocationInfo = {
  full_address: string | null;
  name: string | null;
  mapbox_id: string | null;
  feature_type: string | null;
  relevance: number | null;
  address_accuracy: string | null;
  mapbox_lng: number | null;
  mapbox_lat: number | null;
  neighborhood: string | null;
  place: string | null;
  district: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  country_code: string | null;
};

const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const locationCache = new Map<string, { value: LocationInfo; createdAt: number }>();

function fromContext(context: ContextItem[] | undefined, prefix: string): string | null {
  if (!context?.length) return null;
  const item = context.find((entry) => (entry.id ?? "").startsWith(prefix));
  return item?.text ?? null;
}

function fromContextShortCode(context: ContextItem[] | undefined, prefix: string): string | null {
  if (!context?.length) return null;
  const item = context.find((entry) => (entry.id ?? "").startsWith(prefix));
  return item?.short_code ?? null;
}

function getToken(): string {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
}

function toCacheKey(lat: number, lng: number): string {
  // Round to reduce duplicate lookups for nearly-identical points.
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function getCachedLocation(cacheKey: string): LocationInfo | null {
  const entry = locationCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > LOCATION_CACHE_TTL_MS) {
    locationCache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedLocation(cacheKey: string, value: LocationInfo) {
  locationCache.set(cacheKey, { value, createdAt: Date.now() });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");

  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: "Missing MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN" }, { status: 503 });
  }

  const cacheKey = toCacheKey(lat, lng);
  const cached = getCachedLocation(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
  url.searchParams.set("types", "address,poi,neighborhood,place,district,region,postcode,country");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);

  const upstream = await fetch(url.toString(), { cache: "force-cache" });
  if (!upstream.ok) {
    return NextResponse.json({ error: `Mapbox reverse geocode failed: HTTP ${upstream.status}` }, { status: 502 });
  }

  const raw = (await upstream.json()) as MapboxReverseResponse;
  const feature = raw.features?.[0];

  const payload: LocationInfo = {
    full_address: feature?.place_name ?? null,
    name: feature?.text ?? null,
    mapbox_id: feature?.id ?? null,
    feature_type: feature?.place_type?.[0] ?? null,
    relevance: typeof feature?.relevance === "number" ? feature.relevance : null,
    address_accuracy: feature?.properties?.accuracy ?? null,
    mapbox_lng: feature?.center?.[0] ?? null,
    mapbox_lat: feature?.center?.[1] ?? null,
    neighborhood: fromContext(feature?.context, "neighborhood"),
    place: fromContext(feature?.context, "place"),
    district: fromContext(feature?.context, "district"),
    region: fromContext(feature?.context, "region"),
    postcode: fromContext(feature?.context, "postcode"),
    country: fromContext(feature?.context, "country"),
    country_code: fromContextShortCode(feature?.context, "country"),
  };

  setCachedLocation(cacheKey, payload);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
