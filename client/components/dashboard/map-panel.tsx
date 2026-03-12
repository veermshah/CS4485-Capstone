"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import { useId } from "react";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type BuildingFeatureProperties,
  mockBuildings,
} from "@/lib/mock-buildings";

type MapPanelProps = {
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  onVisibleBuildingsChange: (buildingIds: string[]) => void;
  className?: string;
};

type HoverTooltip = {
  x: number;
  y: number;
  buildingId: string;
  damageClass: BuildingFeatureProperties["damage_class"];
  confidence: number;
};

const DAMAGE_COLOR: Record<BuildingFeatureProperties["damage_class"], string> = {
  no_damage: "#22c55e",
  minor: "#f59e0b",
  major: "#f97316",
  destroyed: "#ef4444",
};

type MapboxWithAccessToken = typeof import("mapbox-gl") & {
  accessToken: string;
};

export function MapPanel({
  selectedBuildingId,
  onSelectBuilding,
  onVisibleBuildingsChange,
  className,
}: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const geocoderRef = useRef<MapboxGeocoder | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const mapContainerId = useId();

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    let mounted = true;

    const initializeMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default as unknown as MapboxWithAccessToken;
      if (!mounted || !mapContainerRef.current) {
        return;
      }

      const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
      if (!accessToken) {
        return;
      }

      mapboxgl.accessToken = accessToken;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-122.714, 38.44],
        zoom: 11.5,
        maxBounds: [
          [-123.05, 38.2],
          [-122.35, 38.7],
        ],
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
        map.flyTo({
          center: event.result.center as [number, number],
          zoom: 14,
        });
      });

      const updateVisibleBuildings = () => {
        if (!map.getLayer("buildings-fill")) {
          return;
        }

        const features = map.queryRenderedFeatures({
          layers: ["buildings-fill"],
        });

        const visibleIds = Array.from(
          new Set(
            features
              .map((feature) => (feature.properties as { building_id?: string } | undefined)?.building_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        onVisibleBuildingsChange(visibleIds);
      };

      map.on("load", () => {
        map.addSource("buildings", {
          type: "geojson",
          data: mockBuildings,
        });

        map.addLayer({
          id: "buildings-fill",
          type: "fill",
          source: "buildings",
          paint: {
            "fill-color": [
              "match",
              ["get", "damage_class"],
              "no_damage",
              DAMAGE_COLOR.no_damage,
              "minor",
              DAMAGE_COLOR.minor,
              "major",
              DAMAGE_COLOR.major,
              "destroyed",
              DAMAGE_COLOR.destroyed,
              "#9ca3af",
            ],
            "fill-opacity": 0.45,
          },
        });

        map.addLayer({
          id: "buildings-outline",
          type: "line",
          source: "buildings",
          paint: {
            "line-color": "#111827",
            "line-width": 1,
            "line-opacity": 0.8,
          },
        });

        map.addLayer({
          id: "buildings-selected-outline",
          type: "line",
          source: "buildings",
          filter: ["==", ["get", "building_id"], ""],
          paint: {
            "line-color": "#2563eb",
            "line-width": 3,
          },
        });

        updateVisibleBuildings();
      });

      map.on("moveend", updateVisibleBuildings);

      map.on("mousemove", "buildings-fill", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || !feature.properties) {
          setHoverTooltip(null);
          return;
        }

        const properties = feature.properties as unknown as BuildingFeatureProperties;
        setHoverTooltip({
          x: event.point.x + 12,
          y: event.point.y + 12,
          buildingId: String(properties.building_id),
          damageClass: properties.damage_class,
          confidence: Number(properties.confidence),
        });
      });

      map.on("mouseleave", "buildings-fill", () => {
        map.getCanvas().style.cursor = "";
        setHoverTooltip(null);
      });

      map.on("click", "buildings-fill", (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties as
          | BuildingFeatureProperties
          | undefined;
        const buildingId = properties?.building_id;
        if (!buildingId) {
          return;
        }
        onSelectBuilding(buildingId);
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
  }, [onSelectBuilding, onVisibleBuildingsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("buildings-selected-outline")) {
      return;
    }

    map.setFilter("buildings-selected-outline", [
      "==",
      ["get", "building_id"],
      selectedBuildingId ?? "",
    ]);
  }, [selectedBuildingId]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Wildfire Map</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-56px)]">
        <div className="relative h-full overflow-hidden rounded-md border">
          <div
            id={mapContainerId}
            ref={mapContainerRef}
            className="h-full w-full bg-muted"
          />
          {hoverTooltip ? (
            <div
              className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
              style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
            >
              <div className="font-medium">{hoverTooltip.buildingId}</div>
              <div>Damage: {hoverTooltip.damageClass}</div>
              <div>Confidence: {(hoverTooltip.confidence * 100).toFixed(0)}%</div>
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
