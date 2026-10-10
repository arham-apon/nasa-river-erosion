import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyBasePalette, baseStyle, DARK_ONLY } from "./mapStyle.js";
import { prefersReducedMotion } from "../../lib/urlState.js";
import { usePalette } from "../../theme/ThemeContext.jsx";
import s from "./map.module.css";

// MapLibre 6 derives its worker URL at runtime, which bundlers cannot see; hand it the bundled worker instead.
setWorkerUrl(workerUrl);

const MapCtx = createContext(null);
export const useMap = () => useContext(MapCtx);

export default function MapView({ initialBounds, basemap = "map", tilt = false, tiltPitch = 55, label, children }) {
  const el = useRef(null);
  const [map, setMap] = useState(null);
  const palette = usePalette();

  useEffect(() => {
    const m = new MapLibreMap({
      container: el.current,
      style: baseStyle(palette),
      bounds: initialBounds,
      fitBoundsOptions: { padding: 48 },
      attributionControl: { compact: true },
      maxPitch: 72,
      fadeDuration: 0,
    });
    // style.load, not load: our data should not wait for every remote base-map tile to arrive.
    m.once("style.load", () => setMap(m));
    // The panel divider changes the map's width without a window resize.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      setMap(null);
      m.remove();
    };
    // Bounds only seed the first view; later moves are explicit fitBounds calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    for (const id of DARK_ONLY) map.setLayoutProperty(id, "visibility", basemap === "map" ? "visible" : "none");
    map.setLayoutProperty("esri", "visibility", basemap === "satellite" ? "visible" : "none");
  }, [map, basemap]);

  useEffect(() => {
    if (map) applyBasePalette(map, palette);
  }, [map, palette]);

  useEffect(() => {
    if (!map) return;
    map.easeTo({ pitch: tilt ? tiltPitch : 0, bearing: tilt ? -14 : 0, duration: prefersReducedMotion() ? 0 : 900 });
  }, [map, tilt, tiltPitch]);

  return (
    <div className={s.mapView}>
      <div ref={el} className={s.canvas} role="region" aria-label={label} />
      {map && <MapCtx.Provider value={map}>{children}</MapCtx.Provider>}
    </div>
  );
}
