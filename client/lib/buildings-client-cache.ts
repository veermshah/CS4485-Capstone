type GeoJsonFeatureCollection = { type: string; features: unknown[] };

let buildingsPromise: Promise<GeoJsonFeatureCollection | null> | null = null;

/**
 * Returns a shared Promise so multiple components do not duplicate /api/buildings requests.
 */
export function getBuildingsGeojson(): Promise<GeoJsonFeatureCollection | null> {
  if (!buildingsPromise) {
    buildingsPromise = fetch("/api/buildings", { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) {
          buildingsPromise = null;
          return null;
        }
        return res.json() as Promise<GeoJsonFeatureCollection>;
      })
      .catch(() => {
        buildingsPromise = null;
        return null;
      });
  }
  return buildingsPromise;
}
