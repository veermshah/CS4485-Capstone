"use client";

import { useMemo } from "react";
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
  collapsed: boolean;
  onToggle: () => void;
  selectedDamageClasses: RealBuilding["damage_class"][];
  onDamageClassesChange: (classes: RealBuilding["damage_class"][]) => void;
  className?: string;
};

export function FiltersPanel({
  collapsed,
  onToggle,
  selectedDamageClasses,
  onDamageClassesChange,
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

  if (collapsed) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={onToggle}>
            Expand
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Filters</CardTitle>
        <Button variant="outline" size="sm" onClick={onToggle}>
          Collapse
        </Button>
      </CardHeader>

      <CardContent className="h-[calc(100%-56px)] space-y-4 overflow-auto">
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

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => onDamageClassesChange([...ALL_DAMAGE_CLASSES])}>
            Reset
          </Button>
          <Button size="sm" variant="secondary" disabled>
            Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
