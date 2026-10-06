import { useRef, useState } from "react";
import { dayNumber, fmtDate, fmtNum } from "../../lib/format.js";
import { useWidth } from "../../lib/useWidth.js";
import s from "../history/chart.module.css";

const PASS_DAYS = 12;

/** Lines on a true date axis: a missed pass shows as a dotted gap, never as an invented point. */
export default function TimelineChart({ points, series, markDate, markLabel, lang, height = 150, ariaLabel }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [hover, setHover] = useState(null);
  const pad = { l: 2, r: 46, t: 14, b: 22 };
  const d0 = dayNumber(points[0].date);
  const d1 = dayNumber(points.at(-1).date);
  const x = (iso) => pad.l + ((dayNumber(iso) - d0) / Math.max(1, d1 - d0)) * (width - pad.l - pad.r);
  const max = Math.max(...points.flatMap((p) => series.map((sr) => p[sr.key] ?? 0)));
  const h = height - pad.t - pad.b;
  const y = (v) => pad.t + (1 - v / max) * h;

  const segments = (key) => {
    const solid = [];
    const gaps = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a[key] == null || b[key] == null) continue;
      const seg = `M${x(a.date)},${y(a[key])}L${x(b.date)},${y(b[key])}`;
      (dayNumber(b.date) - dayNumber(a.date) > PASS_DAYS + 1 ? gaps : solid).push(seg);
    }
    return { solid: solid.join(""), gaps: gaps.join("") };
  };

  return (
    <figure className={s.chart} ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <line x1={pad.l} x2={width - pad.r} y1={pad.t} y2={pad.t} className={s.grid} />
        <text x={width - pad.r + 4} y={pad.t + 3} className={s.axis}>
          {fmtNum(max, lang)}
        </text>
        <text x={width - pad.r + 4} y={pad.t + h + 3} className={s.axis}>
          {fmtNum(0, lang)}
        </text>
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + h} y2={pad.t + h} className={s.baseline} />
        {markDate && (
          <>
            <line x1={x(markDate)} x2={x(markDate)} y1={pad.t - 6} y2={pad.t + h} className={s.mark} />
            <text x={x(markDate) - 4} y={pad.t - 4} textAnchor="end" className={s.axis}>
              {markLabel}
            </text>
          </>
        )}
        {series.map((sr) => {
          const seg = segments(sr.key);
          return (
            <g key={sr.key}>
              <path d={seg.solid} className={s.line} stroke={sr.color} />
              <path d={seg.gaps} className={s.gap} stroke={sr.color} />
              {points.map((p) =>
                p[sr.key] == null ? null : (
                  <circle key={p.date} cx={x(p.date)} cy={y(p[sr.key])} r={hover === p.date ? 4 : 2.6} fill={sr.color} />
                ),
              )}
            </g>
          );
        })}
        {points.map((p, i) => (
          <g key={p.date}>
            <rect
              x={x(p.date) - 10}
              y={pad.t}
              width={20}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(p.date)}
              onMouseLeave={() => setHover(null)}
            />
            {(i === 0 || i === points.length - 1 || hover === p.date) && (
              <text
                x={x(p.date)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className={hover === p.date ? s.axisActive : s.axis}
              >
                {fmtDate(p.date, lang, { day: "numeric", month: "short" })}
              </text>
            )}
            <line x1={x(p.date)} x2={x(p.date)} y1={pad.t + h} y2={pad.t + h + 3} className={s.baseline} />
          </g>
        ))}
      </svg>
      {hover && (
        <div className={s.readout} style={{ left: Math.min(width - 190, Math.max(0, x(hover) - 40)) }}>
          <span className="mono">{fmtDate(hover, lang)}</span>{" "}
          {series
            .map((sr) => `${sr.short}: ${fmtNum(points.find((p) => p.date === hover)[sr.key], lang)}`)
            .join(" · ")}
        </div>
      )}
    </figure>
  );
}
