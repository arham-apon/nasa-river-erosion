import { useEffect, useRef } from "react";
import { useMap } from "./MapView.jsx";

const EMPTY = { type: "FeatureCollection", features: [] };

function safe(fn) {
  try {
    fn();
  } catch {
    /* map already torn down */
  }
}

/**
 * One GeoJSON source with its style layers. layers: [{ id, type, paint, layout, filter, slot, interactive }].
 * The interactive layer reports hover/click; hover also sets feature-state { hover: true } (needs promoteId).
 */
export default function GeoLayer({ id, data, layers, promoteId, onClick, onHover, visible = true }) {
  const map = useMap();
  const cb = useRef({ onClick, onHover });
  cb.current = { onClick, onHover };
  const layersKey = JSON.stringify(layers);

  useEffect(() => {
    map.addSource(id, { type: "geojson", data: data ?? EMPTY, promoteId });
    for (const l of layers) {
      const { slot = "slot-line", interactive, ...spec } = l;
      // Hidden layers stay mounted so toggling them never reshuffles the stacking order.
      map.addLayer({ ...spec, layout: { ...spec.layout, visibility: visible ? "visible" : "none" }, source: id }, slot);
    }
    const hit = layers.find((l) => l.interactive)?.id;
    let hoverId = null;
    const setHover = (fid) => {
      if (hoverId != null) safe(() => map.setFeatureState({ source: id, id: hoverId }, { hover: false }));
      hoverId = fid;
      if (fid != null) map.setFeatureState({ source: id, id: fid }, { hover: true });
    };
    const onMove = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      if (f.id !== hoverId) setHover(f.id);
      map.getCanvas().style.cursor = "pointer";
      cb.current.onHover?.(f, e.point);
    };
    const onLeave = () => {
      setHover(null);
      map.getCanvas().style.cursor = "";
      cb.current.onHover?.(null);
    };
    const onTap = (e) => e.features?.[0] && cb.current.onClick?.(e.features[0], e);
    if (hit) {
      map.on("mousemove", hit, onMove);
      map.on("mouseleave", hit, onLeave);
      map.on("click", hit, onTap);
    }
    return () =>
      safe(() => {
        if (hit) {
          map.off("mousemove", hit, onMove);
          map.off("mouseleave", hit, onLeave);
          map.off("click", hit, onTap);
        }
        for (const l of layers) if (map.getLayer(l.id)) map.removeLayer(l.id);
        if (map.getSource(id)) map.removeSource(id);
      });
    // Structure changes remount via `key`; paint/filter changes are patched below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id]);

  useEffect(() => {
    map.getSource(id)?.setData(data ?? EMPTY);
  }, [map, id, data]);

  useEffect(() => {
    for (const l of layers) if (map.getLayer(l.id)) map.setLayoutProperty(l.id, "visibility", visible ? "visible" : "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]);

  useEffect(() => {
    for (const l of layers) {
      if (!map.getLayer(l.id)) continue;
      for (const [k, v] of Object.entries(l.paint ?? {})) map.setPaintProperty(l.id, k, v);
      for (const [k, v] of Object.entries(l.layout ?? {})) map.setLayoutProperty(l.id, k, v);
      map.setFilter(l.id, l.filter ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layersKey]);

  return null;
}
