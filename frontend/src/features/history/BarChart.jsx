import { useId, useRef, useState } from "react";
import { fmtNum, fmtYear } from "../../lib/format.js";
import { useWidth } from "../../lib/useWidth.js";
import s from "./chart.module.css";

/**
 * Bars per year. `subset` is drawn inside each bar (hatched), never stacked on top: it is part of the total.
 * null = no observation (marked with a dash), 0 = observed zero.
 */
export default function BarChart({
  years,
  values,
  subset,
  highlight,
  threshold,
  thresholdLabel,
  onSelect,
  unit,
  lang,
  height = 128,
  ariaLabel,
  digits = 1,
}) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const hatch = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const pad = { l: 2, r: 34, t: 14, b: 20 };
  const finite = values.filter((v) => v != null);
  const max = Math.max(threshold ?? 0, ...finite, 0.001);
  const n = values.length;
  const bw = (width - pad.l - pad.r) / n;
  const gap = Math.max(2, bw * 0.22);
  const h = height - pad.t - pad.b;
  const y = (v) => pad.t + (1 - v / max) * h;
  const base = pad.t + h;
  const every = bw < 30 ? 2 : 1;
  const active = hover ?? highlight;

  return (
    <figure className={s.chart} ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: "var(--bg)" }} strokeWidth="1.8" />
          </pattern>
        </defs>
        <line x1={pad.l} x2={width - pad.r} y1={pad.t} y2={pad.t} className={s.grid} />
        <text x={width - pad.r + 4} y={pad.t + 3} className={s.axis}>
          {fmtNum(max, lang, max < 10 ? 1 : 0)}
        </text>
        <text x={width - pad.r + 4} y={base + 3} className={s.axis}>
          {fmtNum(0, lang)}
        </text>
        {values.map((v, i) => {
          const x = pad.l + i * bw + gap / 2;
          const w = bw - gap;
          const dim = active != null && active !== i;
          const sub = subset?.[i];
          return (
            <g
              key={years[i]}
              className={onSelect ? s.clickable : undefined}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(i) : undefined}
            >
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={h} fill="transparent" />
              {v == null ? (
                <line x1={x + w * 0.3} x2={x + w * 0.7} y1={base - 3} y2={base - 3} className={s.missing} />
              ) : (
                <>
                  <rect x={x} y={y(v)} width={w} height={Math.max(v > 0 ? 1 : 0, base - y(v))} className={s.bar} opacity={dim ? 0.45 : 1} />
                  {sub > 0 && (
                    <rect x={x} y={y(sub)} width={w} height={base - y(sub)} fill={`url(#${hatch})`} opacity={dim ? 0.45 : 1} />
                  )}
                </>
              )}
              {(i % every === 0 || i === active) && (
                <text x={x + w / 2} y={height - 5} textAnchor="middle" className={i === active ? s.axisActive : s.axis}>
                  {fmtYear(years[i], lang)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={width - pad.r} y1={base} y2={base} className={s.baseline} />
        {threshold != null && (
          <>
            <line x1={pad.l} x2={width - pad.r} y1={y(threshold)} y2={y(threshold)} className={s.threshold} />
            <text x={width - pad.r + 4} y={y(threshold) + 3} className={s.thresholdText}>
              {thresholdLabel}
            </text>
          </>
        )}
      </svg>
      {hover != null && (
        <div className={s.readout} style={{ left: Math.min(width - 120, Math.max(0, pad.l + hover * bw)) }}>
          <span className="mono">{fmtYear(years[hover], lang)}</span>{" "}
          {values[hover] == null ? "—" : `${fmtNum(values[hover], lang, digits)} ${unit}`}
        </div>
      )}
    </figure>
  );
}
