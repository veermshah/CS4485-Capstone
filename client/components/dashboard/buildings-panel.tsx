import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type RealBuilding, DAMAGE_LABEL } from "@/lib/buildings";
import { cn } from "@/lib/utils";

type BuildingsPanelProps = {
  buildings: RealBuilding[];
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  className?: string;
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
  className,
}: BuildingsPanelProps) {
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {building.uid.slice(0, 8)}…
                      </span>
                      <Badge variant={DAMAGE_BADGE_VARIANT[building.damage_class]}>
                        {DAMAGE_LABEL[building.damage_class]}
                      </Badge>
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
