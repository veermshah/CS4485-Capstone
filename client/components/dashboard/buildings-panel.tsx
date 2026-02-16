import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type BuildingsPanelProps = {
  buildings: Building[];
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  className?: string;
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
        <CardTitle>Mock Buildings</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-56px)]">
        <ScrollArea className="h-full pr-2">
          {buildings.length ? (
            <div className="space-y-2">
              {buildings.slice(0, 24).map((building) => {
                const active = selectedBuildingId === building.id;

                return (
                  <button
                    key={building.id}
                    type="button"
                    onClick={() => onSelectBuilding(building.id)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{building.id}</span>
                      <Badge variant="outline">{building.damageClass}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{building.address}</p>
                  </button>
                );
              })}
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
