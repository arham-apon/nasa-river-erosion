// Empty "slot" layers fix the stacking order regardless of which data layers mount first.
export const SLOTS = ["slot-fill", "slot-line", "slot-top"];

// Vector base layers; satellite mode hides them and shows imagery instead.
export const DARK_ONLY = ["base-water", "base-waterway", "base-residential", "base-roads-minor", "base-roads", "base-rail"];

const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** Paint values of the base layers for one palette; also used to repaint on a theme switch. */
function basePaint(P) {
  const b = P.base;
  const halo = { "text-halo-color": b.halo, "text-halo-width": 1.2, "text-halo-blur": 0.4 };
  return {
    bg: { "background-color": b.land },
    esri: P.satellite,
    "base-residential": { "fill-color": b.residential },
    // OSM water is context only: it is not the observed river, which the data layers draw.
    "base-water": { "fill-color": b.water },
    "base-waterway": { "line-color": b.waterway },
    "base-roads-minor": { "line-color": b.roadMinor },
    "base-roads": { "line-color": b.road },
    "base-rail": { "line-color": b.rail },
    "base-boundary": { "line-color": ["case", ["<=", ["get", "admin_level"], 2], b.border, b.borderInner] },
    "base-water-names": { "text-color": b.waterName, ...halo },
    "base-places": { "text-color": ["match", ["get", "class"], "city", b.city, "town", b.town, b.village], ...halo },
  };
}

export function applyBasePalette(map, P) {
  for (const [id, paint] of Object.entries(basePaint(P))) {
    if (!map.getLayer(id)) continue;
    for (const [k, v] of Object.entries(paint)) map.setPaintProperty(id, k, v);
  }
}

export function baseStyle(P) {
  const paint = basePaint(P);
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
      esri: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 18,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
      empty: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "bg", type: "background", paint: paint.bg },
      { id: "esri", type: "raster", source: "esri", layout: { visibility: "none" }, paint: paint.esri },
      {
        id: "base-residential",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]],
        paint: paint["base-residential"],
      },
      { id: "base-water", type: "fill", source: "osm", "source-layer": "water", paint: paint["base-water"] },
      {
        id: "base-waterway",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        minzoom: 8,
        paint: { ...paint["base-waterway"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 13, 1.5] },
      },
      {
        id: "base-roads-minor",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary", "minor"]]],
        paint: { ...paint["base-roads-minor"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 15, 1.4] },
      },
      {
        id: "base-roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: { ...paint["base-roads"], "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 14, 2] },
      },
      {
        id: "base-rail",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["==", ["get", "class"], "rail"],
        paint: { ...paint["base-rail"], "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "base-boundary",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: {
          ...paint["base-boundary"],
          "line-width": ["case", ["<=", ["get", "admin_level"], 2], 1, 0.6],
          "line-dasharray": [4, 2],
        },
      },
      ...SLOTS.map((id) => ({ id, type: "line", source: "empty" })),
      {
        id: "base-water-names",
        type: "symbol",
        source: "osm",
        "source-layer": "waterway",
        minzoom: 10,
        filter: ["==", ["get", "class"], "river"],
        layout: {
          "symbol-placement": "line",
          "text-field": NAME,
          "text-font": ["Noto Sans Italic"],
          "text-size": 11,
          "text-letter-spacing": 0.05,
        },
        paint: paint["base-water-names"],
      },
      {
        id: "base-places",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        layout: {
          "text-field": NAME,
          "text-font": ["Noto Sans Regular"],
          "text-size": ["match", ["get", "class"], "city", 13, "town", 12, 10.5],
          "text-max-width": 8,
          "symbol-sort-key": ["match", ["get", "class"], "city", 0, "town", 1, 2],
          visibility: "visible",
        },
        minzoom: 6,
        paint: {
          ...paint["base-places"],
          "text-opacity": ["step", ["zoom"], ["match", ["get", "class"], "village", 0, 1], 11, 1],
        },
      },
    ],
  };
}
