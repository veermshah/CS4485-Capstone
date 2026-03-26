import type { FeatureCollection, Polygon } from "geojson";

export type BuildingDamageClass = "no_damage" | "minor" | "major" | "destroyed";

export type BuildingFeatureProperties = {
  building_id: string;
  damage_class: BuildingDamageClass;
  confidence: number;
};

const squarePolygon = (
  centerLng: number,
  centerLat: number,
  halfSize: number,
): Polygon => ({
  type: "Polygon",
  coordinates: [[
    [centerLng - halfSize, centerLat - halfSize],
    [centerLng + halfSize, centerLat - halfSize],
    [centerLng + halfSize, centerLat + halfSize],
    [centerLng - halfSize, centerLat + halfSize],
    [centerLng - halfSize, centerLat - halfSize],
  ]],
});

const seed = [
  { id: "BLDG-0001", lng: -122.735, lat: 38.447, damage: "major", confidence: 0.82 },
  { id: "BLDG-0002", lng: -122.721, lat: 38.452, damage: "no_damage", confidence: 0.91 },
  { id: "BLDG-0003", lng: -122.708, lat: 38.438, damage: "destroyed", confidence: 0.77 },
  { id: "BLDG-0004", lng: -122.697, lat: 38.432, damage: "minor", confidence: 0.69 },
  { id: "BLDG-0005", lng: -122.683, lat: 38.447, damage: "major", confidence: 0.74 },
  { id: "BLDG-0006", lng: -122.668, lat: 38.458, damage: "no_damage", confidence: 0.88 },
  { id: "BLDG-0007", lng: -122.747, lat: 38.425, damage: "minor", confidence: 0.63 },
  { id: "BLDG-0008", lng: -122.729, lat: 38.421, damage: "destroyed", confidence: 0.86 },
  { id: "BLDG-0009", lng: -122.712, lat: 38.418, damage: "major", confidence: 0.72 },
  { id: "BLDG-0010", lng: -122.694, lat: 38.414, damage: "no_damage", confidence: 0.93 },
  { id: "BLDG-0011", lng: -122.676, lat: 38.421, damage: "minor", confidence: 0.66 },
  { id: "BLDG-0012", lng: -122.659, lat: 38.429, damage: "major", confidence: 0.79 },
] as const;

export const mockBuildings: FeatureCollection<Polygon, BuildingFeatureProperties> = {
  type: "FeatureCollection",
  features: seed.map((entry, index) => ({
    type: "Feature",
    id: entry.id,
    properties: {
      building_id: entry.id,
      damage_class: entry.damage,
      confidence: entry.confidence,
    },
    geometry: squarePolygon(entry.lng, entry.lat, 0.0021 + (index % 3) * 0.00035),
  })),
};
