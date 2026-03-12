"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type RealBuilding, DAMAGE_LABEL } from "@/lib/buildings";

type DetailsDrawerProps = {
  building: RealBuilding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DetailsDrawer({ building, open, onOpenChange }: DetailsDrawerProps) {
  const [imageryView, setImageryView] = useState<"pre" | "post">("post");

  const shortId = building?.uid.slice(0, 8) ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[460px] p-0 sm:w-[460px]">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1">
              <SheetTitle className="font-mono text-base">
                {building ? shortId + "…" : "No building selected"}
              </SheetTitle>
              <SheetDescription>
                {building ? "xBD label" : "Select a building from the list to inspect details."}
              </SheetDescription>
            </div>
            <Button variant="outline" size="sm">Flag</Button>
          </div>
        </SheetHeader>

        {building ? (
          <div className="h-[calc(100%-94px)] overflow-y-auto px-5 py-4">
            <Tabs defaultValue="overview" className="h-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="imagery">Imagery</TabsTrigger>
              </TabsList>

              {/* Overview — damage class + UID only */}
              <TabsContent value="overview" className="mt-4 rounded-md border bg-card p-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Damage class</span>
                    <Badge>{DAMAGE_LABEL[building.damage_class]}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">UID</span>
                    <span className="font-mono text-xs">{building.uid}</span>
                  </div>
                </div>
              </TabsContent>

              {/* Imagery — full tile PNG for this building's tile */}
              <TabsContent value="imagery" className="mt-4 space-y-3 rounded-md border bg-card p-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={imageryView === "pre" ? "default" : "outline"}
                    onClick={() => setImageryView("pre")}
                  >
                    Pre
                  </Button>
                  <Button
                    size="sm"
                    variant={imageryView === "post" ? "default" : "outline"}
                    onClick={() => setImageryView("post")}
                  >
                    Post
                  </Button>
                </div>

                {building.tile_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${building.tile_id}-${building.uid}-${imageryView}`}
                    src={`/api/building-crop/${building.tile_id}/${building.uid}/${imageryView}`}
                    alt={`${imageryView}-disaster crop for ${building.uid}`}
                    className="w-full rounded-md border object-contain"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    No source imagery available
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="px-5 py-4 text-sm text-muted-foreground">
            No building is currently selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
