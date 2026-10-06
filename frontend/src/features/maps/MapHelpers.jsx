import { useEffect } from "react";
import { useMap } from "./MapView.jsx";
import { prefersReducedMotion } from "../../lib/urlState.js";

export function FitBounds({ bounds, maxZoom = 13 }) {
  const map = useMap();
  const key = bounds ? bounds.flat().map((v) => v.toFixed(4)).join(",") : "";
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 64, left: 56, right: 72 },
      maxZoom,
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: prefersReducedMotion() ? 0 : 900,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Mirrors a hover that started outside the map (e.g. a list row) onto a feature. */
export function HoverSync({ source, id }) {
  const map = useMap();
  useEffect(() => {
    if (id == null || !map.getSource(source)) return undefined;
    map.setFeatureState({ source, id }, { hover: true });
    return () => {
      try {
        map.setFeatureState({ source, id }, { hover: false });
      } catch {
        /* source removed */
      }
    };
  }, [map, source, id]);
  return null;
}
