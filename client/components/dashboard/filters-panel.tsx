"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type RealBuilding, DAMAGE_LABEL } from "@/lib/buildings";
import { cn } from "@/lib/utils";

export const ALL_DAMAGE_CLASSES: RealBuilding["damage_class"][] = [
  "no_damage",
  "minor",
  "major",
  "destroyed",
];

type FiltersPanelProps = {
  collapsed?: boolean;
  onToggle?: () => void;
  selectedDamageClasses: RealBuilding["damage_class"][];
  onDamageClassesChange: (classes: RealBuilding["damage_class"][]) => void;
  flaggedBuildings?: RealBuilding[];
  flaggedVisibleBuildings?: RealBuilding[];
  estimatedAccuracyPct?: number | null;
  className?: string;
};

export function FiltersPanel({
  collapsed = false,
  onToggle,
  selectedDamageClasses,
  onDamageClassesChange,
  flaggedBuildings = [],
  flaggedVisibleBuildings = [],
  estimatedAccuracyPct = null,
  className,
}: FiltersPanelProps) {
  const damageLabel = useMemo(() => {
    if (selectedDamageClasses.length === ALL_DAMAGE_CLASSES.length) return "All classes";
    if (selectedDamageClasses.length <= 2)
      return selectedDamageClasses.map((c) => DAMAGE_LABEL[c]).join(", ");
    return `${selectedDamageClasses.length} selected`;
  }, [selectedDamageClasses]);

  const toggleDamageClass = (cls: RealBuilding["damage_class"], checked: boolean) => {
    if (!checked && selectedDamageClasses.length === 1) return; // enforce min 1
    onDamageClassesChange(
      checked
        ? [...selectedDamageClasses, cls]
        : selectedDamageClasses.filter((c) => c !== cls),
    );
  };

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Filters</CardTitle>
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggle}
            aria-label={collapsed ? "Expand filters" : "Collapse filters"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="flex-1 space-y-4 overflow-auto">
          <div className="space-y-2">
            <p className="text-sm font-medium">Damage classes</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  {damageLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {ALL_DAMAGE_CLASSES.map((cls) => (
                  <DropdownMenuCheckboxItem
                    key={cls}
                    checked={selectedDamageClasses.includes(cls)}
                    onCheckedChange={(checked) => toggleDamageClass(cls, checked)}
                    disabled={
                      selectedDamageClasses.length === 1 && selectedDamageClasses[0] === cls
                    }
                  >
                    {DAMAGE_LABEL[cls]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-muted-foreground">At least one class must remain selected.</p>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="text-sm font-medium">Estimated accuracy</p>
            {estimatedAccuracyPct === null ? (
              <p className="text-xs text-muted-foreground">No buildings in view yet.</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {estimatedAccuracyPct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Of currently-visible buildings, after subtracting flagged ones.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Flagged buildings</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <Flag className="h-3 w-3" />
                {flaggedBuildings.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {flaggedVisibleBuildings.length} flagged in current view.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
