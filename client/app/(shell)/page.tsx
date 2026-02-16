"use client";

import { useMemo, useState } from "react";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { BuildingsPanel } from "@/components/dashboard/buildings-panel";
import { DetailsDrawer } from "@/components/dashboard/details-drawer";
import { FiltersPanel } from "@/components/dashboard/filters-panel";
import { MapPanel } from "@/components/dashboard/map-panel";
import { buildings } from "@/lib/mock-data";

export default function DashboardPage() {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );
  const [visibleBuildingIds, setVisibleBuildingIds] = useState<string[]>(
    buildings.map((building) => building.id),
  );

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId) ?? null,
    [selectedBuildingId],
  );

  const visibleBuildings = useMemo(
    () => buildings.filter((building) => visibleBuildingIds.includes(building.id)),
    [visibleBuildingIds],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] grid-rows-[620px_320px] gap-4">
      <div className="min-h-0">
        <MapPanel
          selectedBuildingId={selectedBuildingId}
          onSelectBuilding={setSelectedBuildingId}
          onVisibleBuildingsChange={setVisibleBuildingIds}
          className="h-full"
        />
      </div>

      <div className="min-h-0">
        <ChatPanel className="h-full" />
      </div>

      <div className="min-h-0">
        <BuildingsPanel
          buildings={visibleBuildings}
          selectedBuildingId={selectedBuildingId}
          onSelectBuilding={setSelectedBuildingId}
          className="h-full"
        />
      </div>

      <div className="min-h-0">
        <FiltersPanel
          collapsed={filtersCollapsed}
          onToggle={() => setFiltersCollapsed((prev) => !prev)}
          className="h-full"
        />
      </div>

      <DetailsDrawer
        building={selectedBuilding}
        open={Boolean(selectedBuilding)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBuildingId(null);
          }
        }}
      />
    </div>
  );
}
