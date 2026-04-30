"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { BuildingsPanel } from "@/components/dashboard/buildings-panel";
import { DetailsDrawer } from "@/components/dashboard/details-drawer";
import { FiltersPanel, ALL_DAMAGE_CLASSES } from "@/components/dashboard/filters-panel";
import { MapPanel } from "@/components/dashboard/map-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type RealBuilding } from "@/lib/buildings";
import { getBuildingsGeojson } from "@/lib/buildings-client-cache";

type BuildingFeature = {
  properties: RealBuilding;
  geometry?: {
    type?: string;
    coordinates?: number[][][];
  };
};

const FLAG_STORAGE_KEY = "firelens-flagged-buildings";

function deriveCentroidFromRing(ring: number[][] | undefined): { lng: number; lat: number } | null {
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

export default function DashboardPage() {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [chatMapFocus, setChatMapFocus] = useState<{
    kind: string;
    center: { lng: number; lat: number } | null;
    zoom?: number | null;
    building_ids?: string[];
    label?: string | null;
  } | null>(null);
  const [visibleBuildingIds, setVisibleBuildingIds] = useState<string[]>([]);
  const [allBuildings, setAllBuildings] = useState<RealBuilding[]>([]);
  const [selectedDamageClasses, setSelectedDamageClasses] = useState<RealBuilding["damage_class"][]>(
    [...ALL_DAMAGE_CLASSES],
  );
  const [flaggedBuildingIds, setFlaggedBuildingIds] = useState<string[]>([]);

  useEffect(() => {
    let timeoutId: number | null = null;

    try {
      const raw = window.localStorage.getItem(FLAG_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        timeoutId = window.setTimeout(() => setFlaggedBuildingIds(parsed), 0);
      }
    } catch {
      // Ignore malformed persisted state.
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify(flaggedBuildingIds));
    } catch {
      // Ignore storage failures.
    }
  }, [flaggedBuildingIds]);

  // Fetch all buildings once from the API
  useEffect(() => {
    let cancelled = false;

    const applyGeojson = (geojson: { features?: unknown[] } | null) => {
      if (!geojson?.features || cancelled) return false;
      const buildings: RealBuilding[] = (geojson.features as BuildingFeature[]).map((f) => {
        const props = f.properties;
        if (typeof props.centroid_lng === "number" && typeof props.centroid_lat === "number") {
          return props;
        }

        const derived = deriveCentroidFromRing(f.geometry?.coordinates?.[0]);
        if (!derived) return props;

        return {
          ...props,
          centroid_lng: derived.lng,
          centroid_lat: derived.lat,
        };
      });
      setAllBuildings(buildings);
      return true;
    };

    const loadBuildings = async () => {
      try {
        const first = await getBuildingsGeojson();
        if (applyGeojson(first)) return;

        // One retry helps with transient dev-server/env race conditions.
        await new Promise((resolve) => setTimeout(resolve, 800));
        const second = await getBuildingsGeojson();
        applyGeojson(second);
      } catch {
        // silent
      }
    };

    void loadBuildings();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBuilding = useMemo(
    () => allBuildings.find((b) => b.building_id === selectedBuildingId) ?? null,
    [allBuildings, selectedBuildingId],
  );

  const flaggedBuildings = useMemo(
    () => allBuildings.filter((building) => flaggedBuildingIds.includes(building.building_id)),
    [allBuildings, flaggedBuildingIds],
  );

  // Only buildings visible on the map AND matching the active damage class filter
  const visibleBuildings = useMemo(
    () =>
      allBuildings.filter(
        (b) =>
          visibleBuildingIds.includes(b.building_id) &&
          selectedDamageClasses.includes(b.damage_class),
      ),
    [allBuildings, visibleBuildingIds, selectedDamageClasses],
  );

    const flaggedVisibleBuildings = useMemo(
      () => visibleBuildings.filter((building) => flaggedBuildingIds.includes(building.building_id)),
      [visibleBuildings, flaggedBuildingIds],
    );

    const estimatedAccuracyPct =
      visibleBuildings.length > 0
        ? Math.max(0, 100 - (flaggedVisibleBuildings.length / visibleBuildings.length) * 100)
        : null;

    const toggleFlaggedBuilding = (buildingId: string) => {
      setFlaggedBuildingIds((current) =>
        current.includes(buildingId)
          ? current.filter((id) => id !== buildingId)
          : [...current, buildingId],
      );
    };

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[600px]">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="firelens-dashboard-cols"
        className="gap-1"
      >
        <ResizablePanel defaultSize={68} minSize={40}>
          <ResizablePanelGroup
            direction="vertical"
            autoSaveId="firelens-dashboard-left"
            className="gap-1"
          >
            <ResizablePanel defaultSize={65} minSize={25}>
              <MapPanel
                selectedBuildingId={selectedBuildingId}
                onSelectBuilding={setSelectedBuildingId}
                onVisibleBuildingsChange={setVisibleBuildingIds}
                selectedDamageClasses={selectedDamageClasses}
                focusTarget={chatMapFocus}
                className="h-full"
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={35} minSize={15}>
              <ChatPanel
                className="h-full"
                selectedBuildingId={selectedBuildingId}
                onMapFocus={setChatMapFocus}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={32} minSize={20}>
          <ResizablePanelGroup
            direction="vertical"
            autoSaveId="firelens-dashboard-right"
            className="gap-1"
          >
            <ResizablePanel defaultSize={70} minSize={20}>
              <BuildingsPanel
                buildings={visibleBuildings}
                selectedBuildingId={selectedBuildingId}
                onSelectBuilding={setSelectedBuildingId}
                flaggedBuildingIds={flaggedBuildingIds}
                className="h-full"
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={30} minSize={15}>
              <FiltersPanel
                collapsed={filtersCollapsed}
                onToggle={() => setFiltersCollapsed((prev) => !prev)}
                selectedDamageClasses={selectedDamageClasses}
                onDamageClassesChange={setSelectedDamageClasses}
                flaggedBuildings={flaggedBuildings}
                flaggedVisibleBuildings={flaggedVisibleBuildings}
                estimatedAccuracyPct={estimatedAccuracyPct}
                className="h-full"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <DetailsDrawer
        building={selectedBuilding}
        open={Boolean(selectedBuilding)}
        onOpenChange={(open) => { if (!open) setSelectedBuildingId(null); }}
        isFlagged={selectedBuilding ? flaggedBuildingIds.includes(selectedBuilding.building_id) : false}
        onToggleFlag={() => {
          if (selectedBuilding) {
            toggleFlaggedBuilding(selectedBuilding.building_id);
          }
        }}
      />
    </div>
  );
}
