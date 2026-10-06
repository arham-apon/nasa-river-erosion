import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { fmtYear } from "../../lib/format.js";
import s from "./timeline.module.css";

/**
 * Dry-season years as ticks; each monsoon's mapped erosion is a bar between the two dry seasons it separates.
 */
export default function YearTimeline({ years, value, compare, onChange, onCompare, playing, onTogglePlay, monsoonHa }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const n = years.length;
  const pos = (i) => ((i + 0.5) / n) * 100;
  const max = Math.max(...Object.values(monsoonHa ?? {}), 1);

  const onKey = (e) => {
    const i = years.indexOf(value);
    if (e.key === "ArrowRight" && i < n - 1) onChange(years[i + 1]);
    else if (e.key === "ArrowLeft" && i > 0) onChange(years[i - 1]);
    else return;
    e.preventDefault();
  };

  return (
    <div className={s.timeline}>
      <button
        type="button"
        className={s.play}
        onClick={onTogglePlay}
        aria-label={playing ? t("river.pause") : t("river.play")}
        aria-pressed={playing}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className={s.track}>
        <svg className={s.bars} aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 24">
          {years.slice(0, -1).map((y, i) => {
            const ha = monsoonHa?.[y];
            if (ha == null) return null;
            const h = Math.max(1, (ha / max) * 22);
            const active = y === value - 1;
            return (
              <rect
                key={y}
                x={(pos(i) + pos(i + 1)) / 2 - 1.4}
                width={2.8}
                y={24 - h}
                height={h}
                className={active ? s.barActive : s.bar}
              />
            );
          })}
        </svg>
        <div className={s.years} role="radiogroup" aria-label={t("river.yearLabel")} onKeyDown={onKey}>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              role="radio"
              aria-checked={y === value}
              tabIndex={y === value ? 0 : -1}
              className={s.year}
              data-compare={y === compare}
              onClick={() => onChange(y)}
            >
              <span className={s.tick} />
              <span className={s.yearText}>{fmtYear(y, lang)}</span>
            </button>
          ))}
        </div>
      </div>

      <label className={s.compare}>
        <span>{t("river.compareWith")}</span>
        <select value={compare ?? ""} onChange={(e) => onCompare(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t("river.none")}</option>
          {years
            .filter((y) => y !== value)
            .map((y) => (
              <option key={y} value={y}>
                {fmtYear(y, lang)}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
