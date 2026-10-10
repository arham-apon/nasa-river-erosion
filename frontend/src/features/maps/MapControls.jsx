import { useTranslation } from "react-i18next";
import { Minus, Plus, Scan } from "lucide-react";
import Segmented from "../../components/ui/Segmented.jsx";
import { useMap } from "./MapView.jsx";
import s from "./map.module.css";

export default function MapControls({ basemap, onBasemap, tilt, onTilt, onReset, tiltLabel }) {
  const { t } = useTranslation();
  const map = useMap();
  return (
    <>
      <div className={s.toolbar}>
        <Segmented
          label={t("map.basemap")}
          value={basemap}
          onChange={onBasemap}
          options={[
            { value: "map", label: t("map.map") },
            { value: "satellite", label: t("map.satellite") },
          ]}
        />
        <Segmented
          label={t("map.view")}
          value={tilt ? "3d" : "2d"}
          onChange={(v) => onTilt(v === "3d")}
          options={[
            { value: "2d", label: "2D" },
            { value: "3d", label: tiltLabel ?? "3D", title: t("map.tiltHint") },
          ]}
        />
      </div>
      <div className={s.zoom}>
        <button type="button" aria-label={t("map.zoomIn")} onClick={() => map.zoomIn()}>
          <Plus size={16} />
        </button>
        <button type="button" aria-label={t("map.zoomOut")} onClick={() => map.zoomOut()}>
          <Minus size={16} />
        </button>
        <button type="button" aria-label={t("map.reset")} title={t("map.reset")} onClick={onReset}>
          <Scan size={16} />
        </button>
      </div>
    </>
  );
}
