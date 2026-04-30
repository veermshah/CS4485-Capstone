/** Building data as returned by /api/buildings (derived from xBD label JSONs). */
export type RealBuilding = {
  building_id: string;
  uid: string;
  tile_id: string;
  damage_class: "no_damage" | "minor" | "major" | "destroyed";
  subtype: string;
  centroid_lng?: number | null;
  centroid_lat?: number | null;
  confidence: number;
};

export const DAMAGE_LABEL: Record<RealBuilding["damage_class"], string> = {
  no_damage: "No Damage",
  minor: "Minor",
  major: "Major",
  destroyed: "Destroyed",
};
