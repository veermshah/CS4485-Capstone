"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import { useId, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ImageryMode = "pre" | "post" | "none";

type MapPanelProps = {
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  onVisibleBuildingsChange: (buildingIds: string[]) => void;
  selectedDamageClasses?: string[];
  className?: string;
};

type HoverTooltip = {
  x: number;
  y: number;
  buildingId: string;
  damageClass: string;
};

const DAMAGE_COLOR: Record<string, string> = {
  no_damage: "#22c55e",
  minor:     "#f59e0b",
  major:     "#f97316",
  destroyed: "#ef4444",
};

type MapboxWithAccessToken = typeof import("mapbox-gl") & { accessToken: string };

type GeoJsonFeatureCollection = { type: string; features: unknown[] };

const BASE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const IMAGERY_BUTTONS: { mode: ImageryMode; label: string }[] = [
  { mode: "pre",  label: "Pre"  },
  { mode: "post", label: "Post" },
  { mode: "none", label: "Base" },
];

export function MapPanel({
  selectedBuildingId,
  onSelectBuilding,
  onVisibleBuildingsChange,
  selectedDamageClasses,
  className,
}: MapPanelProps) {
  const mapContainerRef  = useRef<HTMLDivElement | null>(null);
  const mapRef      = useRef<import("mapbox-gl").Map | null>(null);
  const geocoderRef = useRef<MapboxGeocoder | null>(null);

  // Refs that hold the "current" values of mutable state so closures always
  // see the latest without needing them as effect dependencies.
  const imageryModeRef           = useRef<ImageryMode>("none");
  const baseLayerIdsRef          = useRef<string[]>([]);
  const buildingsDataRef         = useRef<GeoJsonFeatureCollection>({ type: "FeatureCollection", features: [] });
  const selectedDamageClassesRef = useRef<string[]>(selectedDamageClasses ?? ["no_damage","minor","major","destroyed"]);
  const selectedBuildingIdRef    = useRef<string | null>(selectedBuildingId);

  const [imageryMode, setImageryMode]   = useState<ImageryMode>("none");
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const mapContainerId = useId();

  // Keep refs in sync with props/state
  useEffect(() => { selectedDamageClassesRef.current = selectedDamageClasses ?? ["no_damage","minor","major","destroyed"]; }, [selectedDamageClasses]);
  useEffect(() => { selectedBuildingIdRef.current = selectedBuildingId; }, [selectedBuildingId]);

  const changeImageryMode = (mode: ImageryMode) => {
    imageryModeRef.current = mode;
    setImageryMode(mode);
  };

  // ─── Layer setup helpers ───────────────────────────────────────────────────

  /** Add imagery raster sources + layers. Idempotent — skips if already added. */
  const addImageryLayers = (map: import("mapbox-gl").Map) => {
    if (!map.getSource("imagery-pre")) {
      map.addSource("imagery-pre", {
        type: "raster",
        tiles: [`${window.location.origin}/api/tiles/pre/{z}/{x}/{y}`],
        tileSize: 256, minzoom: 18, maxzoom: 18,
        attribution: "xBD / xView2 pre-disaster imagery",
      });
    }
    if (!map.getSource("imagery-post")) {
      map.addSource("imagery-post", {
        type: "raster",
        tiles: [`${window.location.origin}/api/tiles/post/{z}/{x}/{y}`],
        tileSize: 256, minzoom: 18, maxzoom: 18,
        attribution: "xBD / xView2 post-disaster imagery",
      });
    }
    if (!map.getLayer("imagery-pre-layer")) {
      map.addLayer({ id: "imagery-pre-layer",  type: "raster", source: "imagery-pre",  paint: { "raster-opacity": 1 }, layout: { visibility: "none" } });
    }
    if (!map.getLayer("imagery-post-layer")) {
      map.addLayer({ id: "imagery-post-layer", type: "raster", source: "imagery-post", paint: { "raster-opacity": 1 }, layout: { visibility: "none" } });
    }
  };

  /** Add building GeoJSON source + fill/outline layers from cached data. */
  const addBuildingLayers = (map: import("mapbox-gl").Map) => {
    if (!map.getSource("buildings")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addSource("buildings", { type: "geojson", data: buildingsDataRef.current as any });
    }
    if (!map.getLayer("buildings-fill")) {
      map.addLayer({
        id: "buildings-fill", type: "fill", source: "buildings",
        paint: {
          "fill-color": ["match", ["get", "damage_class"],
            "no_damage", DAMAGE_COLOR.no_damage,
            "minor",     DAMAGE_COLOR.minor,
            "major",     DAMAGE_COLOR.major,
            "destroyed", DAMAGE_COLOR.destroyed,
            "#9ca3af"],
          "fill-opacity": 0.55,
        },
      });
    }
    if (!map.getLayer("buildings-outline")) {
      map.addLayer({
        id: "buildings-outline", type: "line", source: "buildings",
        paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.9 },
      });
    }
    if (!map.getLayer("buildings-selected-outline")) {
      map.addLayer({
        id: "buildings-selected-outline", type: "line", source: "buildings",
        filter: ["==", ["get", "building_id"], selectedBuildingIdRef.current ?? ""],
        paint: { "line-color": "#2563eb", "line-width": 3 },
      });
    }
  };

  /** Apply all runtime state (imagery mode, damage filter, selection) to map. */
  const applyAllState = (map: import("mapbox-gl").Map) => {
    applyImageryVisibility(map, imageryModeRef.current, baseLayerIdsRef.current);

    if (map.getLayer("buildings-fill")) {
      const active = selectedDamageClassesRef.current;
      const filter = ["in", ["get", "damage_class"], ["literal", active]] as Parameters<typeof map.setFilter>[1];
      map.setFilter("buildings-fill",    filter);
      map.setFilter("buildings-outline", filter);
    }
    if (map.getLayer("buildings-selected-outline")) {
      map.setFilter("buildings-selected-outline", ["==", ["get", "building_id"], selectedBuildingIdRef.current ?? ""]);
    }
  };

  /** Full setup of custom layers after any style is loaded. */
  const setupCustomLayers = (map: import("mapbox-gl").Map) => {
    baseLayerIdsRef.current = map.getStyle().layers.map((l) => l.id);
    addImageryLayers(map);
    addBuildingLayers(map);
    applyAllState(map);
  };

  // ─── Map initialisation (runs once) ───────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let mounted = true;

    const initializeMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default as unknown as MapboxWithAccessToken;
      if (!mounted || !mapContainerRef.current) return;

      const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
      if (!accessToken) return;

      mapboxgl.accessToken = accessToken;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: BASE_STYLE,
        center: [-122.7144, 38.4403],
        zoom: 13,
        maxBounds: [[-123.05, 38.2], [-122.35, 38.7]],
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

      geocoderRef.current = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl,
        marker: false,
        placeholder: "Search address or place",
      });
      mapRef.current.addControl(geocoderRef.current, "top-left");

      const map = mapRef.current;

      geocoderRef.current.on("result", (event) => {
        map.flyTo({ center: event.result.center as [number, number], zoom: 18, duration: 1500 });
      });

      const updateVisibleBuildings = () => {
        if (!map.getLayer("buildings-fill")) return;
        const features = map.queryRenderedFeatures({ layers: ["buildings-fill"] });
        const visibleIds = Array.from(new Set(
          features
            .map((f) => (f.properties as { building_id?: string } | undefined)?.building_id)
            .filter((id): id is string => Boolean(id)),
        ));
        onVisibleBuildingsChange(visibleIds);
      };

      map.on("load", async () => {
        // Fetch building data once and cache it
        try {
          const res = await fetch("/api/buildings");
          if (res.ok) buildingsDataRef.current = (await res.json()) as GeoJsonFeatureCollection;
        } catch { /* silent fallback */ }

        setupCustomLayers(map);
        updateVisibleBuildings();
      });

      map.on("moveend", updateVisibleBuildings);

      map.on("mousemove", "buildings-fill", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature?.properties) { setHoverTooltip(null); return; }
        const p = feature.properties as Record<string, unknown>;
        setHoverTooltip({
          x: event.point.x + 12, y: event.point.y + 12,
          buildingId: String(p.building_id ?? p.uid ?? ""),
          damageClass: String(p.damage_class ?? ""),
        });
      });

      map.on("mouseleave", "buildings-fill", () => {
        map.getCanvas().style.cursor = "";
        setHoverTooltip(null);
      });

      map.on("click", "buildings-fill", (event) => {
        const id = (event.features?.[0]?.properties as { building_id?: string } | undefined)?.building_id;
        if (id) onSelectBuilding(id);
      });
    };

    initializeMap();

    return () => {
      mounted = false;
      if (mapRef.current && geocoderRef.current) {
        mapRef.current.removeControl(geocoderRef.current);
        geocoderRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelectBuilding, onVisibleBuildingsChange]);

  // ─── Selected building highlight ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("buildings-selected-outline")) return;
    map.setFilter("buildings-selected-outline", ["==", ["get", "building_id"], selectedBuildingId ?? ""]);
  }, [selectedBuildingId]);

  // ─── Imagery mode ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("imagery-pre-layer")) return;
    applyImageryVisibility(map, imageryMode, baseLayerIdsRef.current);
  }, [imageryMode]);

  // ─── Damage class filter ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("buildings-fill")) return;
    const active = selectedDamageClasses ?? ["no_damage", "minor", "major", "destroyed"];
    const filter = ["in", ["get", "damage_class"], ["literal", active]] as Parameters<typeof map.setFilter>[1];
    map.setFilter("buildings-fill",    filter);
    map.setFilter("buildings-outline", filter);
  }, [selectedDamageClasses]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Wildfire Map</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-56px)]">
        <div className="relative h-full overflow-hidden rounded-md border">
          <div id={mapContainerId} ref={mapContainerRef} className="h-full w-full bg-muted" />

          {/* Imagery mode selector — floating bottom-left */}
          <div className="absolute bottom-8 left-2 z-10 flex overflow-hidden rounded shadow-lg">
            {IMAGERY_BUTTONS.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeImageryMode(mode)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold transition-colors",
                  imageryMode === mode
                    ? "bg-white text-black"
                    : "bg-black/65 text-white hover:bg-black/80",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Hover tooltip */}
          {hoverTooltip ? (
            <div
              className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
              style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
            >
              <div className="font-medium">{hoverTooltip.buildingId}</div>
              <div>Damage: {hoverTooltip.damageClass}</div>
            </div>
          ) : null}

          {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
            <div className="pointer-events-none absolute left-3 top-16 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground">
              Set NEXT_PUBLIC_MAPBOX_TOKEN for Mapbox style
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function applyImageryVisibility(
  map: import("mapbox-gl").Map,
  mode: ImageryMode,
  baseLayerIds: string[],
) {
  const isCustom = mode !== "none";

  // Hide/show the satellite raster (only present in light style)
  if (baseLayerIds.includes("satellite")) {
    try {
      map.setLayoutProperty("satellite", "visibility", isCustom ? "none" : "visible");
    } catch { /* skip */ }
  }

  if (map.getLayer("imagery-pre-layer")) {
    map.setLayoutProperty("imagery-pre-layer",  "visibility", mode === "pre"  ? "visible" : "none");
  }
  if (map.getLayer("imagery-post-layer")) {
    map.setLayoutProperty("imagery-post-layer", "visibility", mode === "post" ? "visible" : "none");
  }
}
