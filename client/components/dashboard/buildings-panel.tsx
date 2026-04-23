import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type RealBuilding, DAMAGE_LABEL } from "@/lib/buildings";
import { cn } from "@/lib/utils";

type BuildingsPanelProps = {
  buildings: RealBuilding[];
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  flaggedBuildingIds: string[];
  className?: string;
};

type LocationInfo = {
  full_address: string | null;
};

const DAMAGE_BADGE_VARIANT: Record<
  RealBuilding["damage_class"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  no_damage: "secondary",
  minor: "outline",
  major: "default",
  destroyed: "destructive",
};

export function BuildingsPanel({
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  flaggedBuildingIds,
  className,
}: BuildingsPanelProps) {
  const [addressByBuildingId, setAddressByBuildingId] = useState<Record<string, string>>({});
  const [loadingAddressIds, setLoadingAddressIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const visibleBuildings = buildings.slice(0, 50);

    if (!visibleBuildings.length) {
      setAddressByBuildingId({});
      setLoadingAddressIds([]);
      return () => controller.abort();
    }

    setAddressByBuildingId((current) => {
      const next: Record<string, string> = {};

      for (const building of visibleBuildings) {
        const cachedAddress = current[building.building_id];
        if (cachedAddress) {
          next[building.building_id] = cachedAddress;
        }
      }

      return next;
    });

    const idsToFetch = visibleBuildings
      .filter(
        (building) =>
          !addressByBuildingId[building.building_id] &&
          typeof building.centroid_lat === "number" &&
          typeof building.centroid_lng === "number",
      )
      .map((building) => building.building_id);

    setLoadingAddressIds(idsToFetch);

    if (!idsToFetch.length) {
      return () => controller.abort();
    }

    void Promise.all(
      visibleBuildings.map(async (building) => {
        if (typeof building.centroid_lat !== "number" || typeof building.centroid_lng !== "number") {
          return null;
        }

        const response = await fetch(
          `/api/location-info?lat=${building.centroid_lat}&lng=${building.centroid_lng}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as LocationInfo;
        return payload.full_address?.trim() ?? null;
      }),
    )
      .then((addresses) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadingAddressIds((current) =>
          current.filter((id) => !idsToFetch.includes(id)),
        );

        setAddressByBuildingId((current) => {
          const next = { ...current };

          visibleBuildings.forEach((building, index) => {
            const address = addresses[index];
            if (address) {
              next[building.building_id] = address;
            }
          });

          return next;
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadingAddressIds((current) =>
            current.filter((id) => !idsToFetch.includes(id)),
          );
        }
        // Keep the unavailable label if any lookup fails.
      });

    return () => controller.abort();
  }, [buildings]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          Buildings
          {buildings.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({buildings.length} in view)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-56px)]">
        <ScrollArea className="h-full pr-2">
          {buildings.length ? (
            <div className="space-y-1.5">
              {buildings.slice(0, 50).map((building) => {
                const active = selectedBuildingId === building.building_id;
                const address = addressByBuildingId[building.building_id];
                const isFlagged = flaggedBuildingIds.includes(building.building_id);
                const isLoadingAddress = loadingAddressIds.includes(building.building_id);
                return (
                  <button
                    key={building.building_id}
                    type="button"
                    onClick={() => onSelectBuilding(building.building_id)}
                    className={cn(
                      "w-full rounded-md border p-2.5 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 text-sm leading-snug text-foreground">
                        {address ?? (isLoadingAddress ? "Loading address..." : "Address unavailable")}
                      </span>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge variant={DAMAGE_BADGE_VARIANT[building.damage_class]}>
                          {DAMAGE_LABEL[building.damage_class]}
                        </Badge>
                        {isFlagged && <Badge variant="destructive">Flagged</Badge>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {buildings.length > 50 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Showing 50 of {buildings.length} buildings
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No buildings in current map view.
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
