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
import { Building } from "@/lib/mock-data";

type DetailsDrawerProps = {
  building: Building | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DetailsDrawer({
  building,
  open,
  onOpenChange,
}: DetailsDrawerProps) {
  const [imageryView, setImageryView] = useState<"pre" | "post">("post");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[460px] p-0 sm:w-[460px]">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1">
              <SheetTitle className="text-base">{building?.id ?? "No building selected"}</SheetTitle>
              <SheetDescription>
                {building
                  ? `${building.address} • confidence ${building.confidence}%`
                  : "Select a building from the list to inspect details."}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Flag
              </Button>
              <Button size="sm">Add Note</Button>
            </div>
          </div>
        </SheetHeader>

        {building ? (
          <div className="h-[calc(100%-94px)] overflow-y-auto px-5 py-4">
            <Tabs defaultValue="overview" className="h-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="imagery">Imagery</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 rounded-md border bg-card p-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Damage class</span>
                    <Badge>{building.damageClass}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Source</span>
                    <span>{building.labelSource}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Run</span>
                    <span>{building.runId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last updated</span>
                    <span>{building.updatedAt}</span>
                  </div>
                </div>
              </TabsContent>

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

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    {imageryView.toUpperCase()} image A
                  </div>
                  <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    {imageryView.toUpperCase()} image B
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="evidence" className="mt-4 rounded-md border bg-card p-4 text-sm text-muted-foreground">
                Evidence list placeholder from model and human review artifacts.
              </TabsContent>

              <TabsContent value="history" className="mt-4 rounded-md border bg-card p-4 text-sm text-muted-foreground">
                Change log placeholder for edits, notes, and status transitions.
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
