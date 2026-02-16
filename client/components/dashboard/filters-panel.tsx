"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { damageClasses } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type FiltersPanelProps = {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
};

export function FiltersPanel({ collapsed, onToggle, className }: FiltersPanelProps) {
  const [selectedDamageClasses, setSelectedDamageClasses] = useState<string[]>([
    "No Damage",
    "Minor",
    "Major",
  ]);
  const [confidence, setConfidence] = useState([65]);
  const [useVlmSource, setUseVlmSource] = useState(true);
  const [layers, setLayers] = useState({
    footprints: true,
    points: true,
    heatmap: false,
  });

  const damageLabel = useMemo(() => {
    if (!selectedDamageClasses.length) return "None selected";
    if (selectedDamageClasses.length <= 2) return selectedDamageClasses.join(", ");
    return `${selectedDamageClasses.length} selected`;
  }, [selectedDamageClasses]);

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
              {damageClasses.map((className) => (
                <DropdownMenuCheckboxItem
                  key={className}
                  checked={selectedDamageClasses.includes(className)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedDamageClasses((prev) => [...prev, className]);
                      return;
                    }

                    setSelectedDamageClasses((prev) =>
                      prev.filter((item) => item !== className),
                    );
                  }}
                >
                  {className}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Confidence ({confidence[0]}%)</p>
          <Slider value={confidence} min={0} max={100} step={1} onValueChange={setConfidence} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Label source VLM vs FEMA</span>
            <Switch checked={useVlmSource} onCheckedChange={setUseVlmSource} />
          </div>
          <p className="text-xs text-muted-foreground">Current source: {useVlmSource ? "VLM" : "FEMA"}</p>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Layers</p>

          <div className="flex items-center justify-between">
            <span className="text-sm">Footprints</span>
            <Switch
              checked={layers.footprints}
              onCheckedChange={(checked) => setLayers((prev) => ({ ...prev, footprints: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Points</span>
            <Switch
              checked={layers.points}
              onCheckedChange={(checked) => setLayers((prev) => ({ ...prev, points: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Heatmap</span>
            <Switch
              checked={layers.heatmap}
              onCheckedChange={(checked) => setLayers((prev) => ({ ...prev, heatmap: checked }))}
            />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm">Apply</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedDamageClasses(["No Damage", "Minor", "Major"]);
              setConfidence([65]);
              setUseVlmSource(true);
              setLayers({ footprints: true, points: true, heatmap: false });
            }}
          >
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
