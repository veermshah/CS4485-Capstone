"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { BuildingsPanel } from "@/components/dashboard/buildings-panel";
import { DetailsDrawer } from "@/components/dashboard/details-drawer";
import { FiltersPanel, ALL_DAMAGE_CLASSES } from "@/components/dashboard/filters-panel";
import { MapPanel } from "@/components/dashboard/map-panel";
import { type RealBuilding } from "@/lib/buildings";

export default function DashboardPage() {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [visibleBuildingIds, setVisibleBuildingIds] = useState<string[]>([]);
  const [allBuildings, setAllBuildings] = useState<RealBuilding[]>([]);
  const [selectedDamageClasses, setSelectedDamageClasses] = useState<RealBuilding["damage_class"][]>(
    [...ALL_DAMAGE_CLASSES],
  );

  // Fetch all buildings once from the API
  useEffect(() => {
    fetch("/api/buildings")
      .then((res) => res.ok ? res.json() : null)
      .then((geojson) => {
        if (!geojson?.features) return;
        const buildings: RealBuilding[] = (geojson.features as Array<{
          properties: RealBuilding;
        }>).map((f) => f.properties);
        setAllBuildings(buildings);
      })
      .catch(() => {/* silent */});
  }, []);

  const selectedBuilding = useMemo(
    () => allBuildings.find((b) => b.building_id === selectedBuildingId) ?? null,
    [allBuildings, selectedBuildingId],
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

  return (
    <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] grid-rows-[620px_320px] gap-4">
      <div className="min-h-0">
        <MapPanel
          selectedBuildingId={selectedBuildingId}
          onSelectBuilding={setSelectedBuildingId}
          onVisibleBuildingsChange={setVisibleBuildingIds}
          selectedDamageClasses={selectedDamageClasses}
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
          selectedDamageClasses={selectedDamageClasses}
          onDamageClassesChange={setSelectedDamageClasses}
          className="h-full"
        />
      </div>

      <DetailsDrawer
        building={selectedBuilding}
        open={Boolean(selectedBuilding)}
        onOpenChange={(open) => { if (!open) setSelectedBuildingId(null); }}
      />
    </div>
  );
}
