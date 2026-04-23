"use client";

import { useEffect, useState } from "react";
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
  isFlagged: boolean;
  onToggleFlag: () => void;
};

type LocationInfo = {
  full_address: string | null;
  name: string | null;
  mapbox_id: string | null;
  feature_type: string | null;
  relevance: number | null;
  address_accuracy: string | null;
  mapbox_lng: number | null;
  mapbox_lat: number | null;
  neighborhood: string | null;
  place: string | null;
  district: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  country_code: string | null;
};

export function DetailsDrawer({
  building,
  open,
  onOpenChange,
  isFlagged,
  onToggleFlag,
}: DetailsDrawerProps) {
  const [imageryView, setImageryView] = useState<"pre" | "post">("post");
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const shortId = building?.uid.slice(0, 8) ?? "";
  const centroidLng =
    typeof building?.centroid_lng === "number" ? building.centroid_lng.toFixed(6) : "N/A";
  const centroidLat =
    typeof building?.centroid_lat === "number" ? building.centroid_lat.toFixed(6) : "N/A";
  const relevancePct =
    typeof locationInfo?.relevance === "number" ? `${(locationInfo.relevance * 100).toFixed(0)}%` : "N/A";
  const openMapsHref =
    typeof building?.centroid_lat === "number" && typeof building?.centroid_lng === "number"
      ? `https://www.google.com/maps/search/?api=1&query=${building.centroid_lat},${building.centroid_lng}`
      : null;

  useEffect(() => {
    const hasCoords =
      typeof building?.centroid_lat === "number" && typeof building?.centroid_lng === "number";

    if (!building || !hasCoords) {
      setLocationInfo(null);
      setLocationLoading(false);
      return;
    }

    const controller = new AbortController();
    setLocationLoading(true);

    fetch(
      `/api/location-info?lat=${building.centroid_lat}&lng=${building.centroid_lng}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? (res.json() as Promise<LocationInfo>) : null))
      .then((payload) => {
        setLocationInfo(payload);
      })
      .catch(() => {
        setLocationInfo(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLocationLoading(false);
        }
      });

    return () => controller.abort();
  }, [building?.uid, building?.centroid_lat, building?.centroid_lng]);

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
            <Button variant={isFlagged ? "default" : "outline"} size="sm" onClick={onToggleFlag}>
              {isFlagged ? "Flagged" : "Flag"}
            </Button>
          </div>
        </SheetHeader>

        {building ? (
          <div className="h-[calc(100%-94px)] overflow-y-auto px-5 py-4">
            <Tabs defaultValue="overview" className="h-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="imagery">Imagery</TabsTrigger>
              </TabsList>

              {/* Overview — complete building record */}
              <TabsContent value="overview" className="mt-4 rounded-md border bg-card p-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Building ID</span>
                    <span className="font-mono text-xs">{building.building_id}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tile ID</span>
                    <span className="font-mono text-xs">{building.tile_id}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Longitude</span>
                    <span className="font-mono text-xs">{centroidLng}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Latitude</span>
                    <span className="font-mono text-xs">{centroidLat}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <span className="max-w-[250px] text-right text-xs">
                      {locationLoading
                        ? "Loading..."
                        : (locationInfo?.full_address ?? "N/A")}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Neighborhood</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.neighborhood ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">City / Place</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.place ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">District</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.district ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Region / State</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.region ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Postal code</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.postcode ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span className="max-w-[250px] text-right text-xs">{locationInfo?.country ?? "N/A"}</span>
                  </div>
                  <Separator />
                  <div>
                    {openMapsHref ? (
                      <Button asChild size="sm" variant="outline" className="w-full">
                        <a href={openMapsHref} target="_blank" rel="noreferrer">
                          Open in Maps
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full" disabled>
                        Open in Maps
                      </Button>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtype</span>
                    <span>{building.subtype}</span>
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
