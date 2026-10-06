// Empty "slot" layers fix the stacking order regardless of which data layers mount first.
export const SLOTS = ["slot-fill", "slot-line", "slot-top"];

// Layers drawn only on the dark base map; satellite mode hides them and shows imagery instead.
export const DARK_ONLY = ["base-water", "base-waterway", "base-residential", "base-roads-minor", "base-roads", "base-rail"];

const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const HALO = { "text-halo-color": "#0b0f13", "text-halo-width": 1.2, "text-halo-blur": 0.4 };

export function baseStyle() {
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
      { id: "bg", type: "background", paint: { "background-color": "#0b0f13" } },
      {
        id: "esri",
        type: "raster",
        source: "esri",
        layout: { visibility: "none" },
        // Dimmed and desaturated so the cyan/amber data reads on top of real imagery.
        paint: { "raster-brightness-max": 0.6, "raster-saturation": -0.35, "raster-contrast": 0.08 },
      },
      {
        id: "base-residential",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]],
        paint: { "fill-color": "#11171d" },
      },
      // OSM water is context only: it is not the observed river, which the data layers draw.
      { id: "base-water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": "#0f1b25" } },
      {
        id: "base-waterway",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        minzoom: 8,
        paint: { "line-color": "#13222e", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 13, 1.5] },
      },
      {
        id: "base-roads-minor",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary", "minor"]]],
        paint: { "line-color": "#1a2229", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 15, 1.4] },
      },
      {
        id: "base-roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: { "line-color": "#232d36", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 14, 2] },
      },
      {
        id: "base-rail",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": "#262f38", "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "base-boundary",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": ["case", ["<=", ["get", "admin_level"], 2], "#4a5763", "#2b353f"],
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
        paint: { "text-color": "#5b88a1", ...HALO },
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
          "text-color": ["match", ["get", "class"], "city", "#c4ccd3", "town", "#a1abb4", "#76828d"],
          "text-opacity": ["step", ["zoom"], ["match", ["get", "class"], "village", 0, 1], 11, 1],
          ...HALO,
        },
      },
    ],
  };
}

export const RISK_COLOR = ["match", ["get", "risk"], "High", "#f07a4f", "Medium", "#c9a25b", "#56636e"];
export const PRIORITY_COLOR = ["match", ["get", "level"], "High", "#f07a4f", "Medium", "#c9a25b", "#56636e"];
