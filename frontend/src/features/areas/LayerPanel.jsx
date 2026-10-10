import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import Segmented from "../../components/ui/Segmented.jsx";
import { usePalette } from "../../theme/ThemeContext.jsx";
import { fmtNum, fmtYear } from "../../lib/format.js";
import p from "./panel.module.css";

const OPEN_KEY = "rw-layers-open";

const GROUPS = [
  { key: "forecast", items: ["priority", "risk"] },
  { key: "past", items: ["hindcast", "erosion", "banks"] },
  { key: "nisar", items: ["nisarChange", "nisarCheck"] },
];

// Each swatch repeats the symbol the layer draws on the map, in the active theme.
const swatches = (P) => ({
  priority: { background: P.riskHighA(0.28), border: `1px solid ${P.unionLine}` },
  risk: { background: `linear-gradient(90deg,${P.risk.High} 0 33%,${P.risk.Medium} 33% 66%,${P.risk.Low} 66%)` },
  hindcast: { background: P.erosionA(0.55), outline: `1.5px dashed ${P.flag}`, outlineOffset: -2 },
  erosion: { background: P.erosion },
  banks: { height: 0, borderTop: `2px solid ${P.water}` },
  nisarChange: { background: P.erosion, opacity: 0.85 },
  nisarCheck: { background: P.erosionA(0.4), outline: `1.5px dashed ${P.flag}`, outlineOffset: -2 },
});

export default function LayerPanel({ layers, onToggle, hindYears, hindYear, onHindYear, erosionYears, erosionYear, onErosionYear }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const SWATCH = swatches(usePalette());
  const on = Object.values(layers).filter(Boolean).length;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleOpen = (e) => {
    const next = e.currentTarget.open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* not remembered */
    }
  };

  const extra = (key) => {
    if (key === "hindcast" && layers.hindcast)
      return (
        <div className={p.layerExtra}>
          <Segmented
            block
            label={t("layers.hindYear")}
            value={hindYear}
            onChange={onHindYear}
            options={hindYears.map((y) => ({ value: y, label: fmtYear(y, lang) }))}
          />
        </div>
      );
    if (key === "erosion" && layers.erosion)
      return (
        <div className={p.layerExtra}>
          <label className={p.selectRow}>
            <span>{t("layers.monsoon")}</span>
            <select value={erosionYear} onChange={(e) => onErosionYear(Number(e.target.value))}>
              {erosionYears.map((y) => (
                <option key={y} value={y}>
                  {fmtYear(y, lang)}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    return null;
  };

  return (
    <details className={p.layers} open={open} onToggle={toggleOpen}>
      <summary>
        <span className={p.layersTitle}>{t("layers.title")}</span>
        <span className={p.layersCount}>{t("layers.count", { n: fmtNum(on, lang) })}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </summary>
      {GROUPS.map((g) => (
        <fieldset key={g.key} className={p.layerGroup}>
          <legend>{t(`layers.groups.${g.key}`)}</legend>
          {g.items.map((key) => (
            <div key={key}>
              <label className={p.layer} title={t(`layers.hints.${key}`)}>
                <input
                  type="checkbox"
                  className={p.check}
                  checked={layers[key]}
                  onChange={() => onToggle(key)}
                  aria-describedby={`layer-hint-${key}`}
                />
                <span className={p.layerName}>
                  {t(`layers.items.${key}`)}
                  <span id={`layer-hint-${key}`} className="visually-hidden">
                    {t(`layers.hints.${key}`)}
                  </span>
                </span>
                <i className={p.layerSwatch} style={SWATCH[key]} aria-hidden="true" />
              </label>
              {extra(key)}
            </div>
          ))}
        </fieldset>
      ))}
    </details>
  );
}
