export function unionsOfRegion(unionsFC, region) {
  if (!unionsFC) return [];
  return unionsFC.features
    .filter((f) => f.properties.region === region)
    .map((f) => f.properties)
    .sort((a, b) => a.rankRegion - b.rankRegion || a.name.localeCompare(b.name));
}

export function findUnionFeature(unionsFC, region, key) {
  return unionsFC?.features.find((f) => f.properties.region === region && f.properties.key === key) ?? null;
}

export function sectionsOfUnion(forecastFC, unionKey) {
  if (!forecastFC || !unionKey) return [];
  return forecastFC.features
    .filter((f) => f.properties.union === unionKey)
    .map((f) => f.properties)
    .sort((a, b) => a.riskRank - b.riskRank);
}

export function findSection(forecastFC, id) {
  return forecastFC?.features.find((f) => f.properties.id === id) ?? null;
}

function walk(coords, box) {
  if (typeof coords[0] === "number") {
    box[0] = Math.min(box[0], coords[0]);
    box[1] = Math.min(box[1], coords[1]);
    box[2] = Math.max(box[2], coords[0]);
    box[3] = Math.max(box[3], coords[1]);
    return;
  }
  for (const c of coords) walk(c, box);
}

export function boundsOf(features) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of [].concat(features)) if (f?.geometry) walk(f.geometry.coordinates, box);
  return Number.isFinite(box[0]) ? [[box[0], box[1]], [box[2], box[3]]] : null;
}

export const regionBounds = (manifest, region) => {
  const b = manifest?.regions?.[region]?.bounds;
  return b ? [[b[0], b[1]], [b[2], b[3]]] : null;
};

export const sideLabelKey = (side) => (side === "west" ? "section.west" : "section.east");
