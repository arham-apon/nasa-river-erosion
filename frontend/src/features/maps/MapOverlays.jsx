import s from "./map.module.css";

export function MapTooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className={s.tooltip} style={{ transform: `translate(${tip.x + 14}px, ${tip.y + 14}px)` }} role="status">
      {tip.title && <strong>{tip.title}</strong>}
      {tip.lines?.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

/** items: [{ swatch: "fill"|"line"|"dash"|"outline"|"ramp", color, label, shape }] */
export function Legend({ title, items, note, position = "bottom" }) {
  return (
    <div className={`${s.legend} ${position === "top" ? s.legendTop : ""}`}>
      {title && <div className={s.legendTitle}>{title}</div>}
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <Swatch {...it} />
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className={s.legendNote}>{note}</p>}
    </div>
  );
}

function Swatch({ swatch, color, shape }) {
  if (shape) return <span className={s.swShape} style={{ color }}>{shape}</span>;
  if (swatch === "line") return <i className={s.swLine} style={{ background: color }} />;
  if (swatch === "dash") return <i className={s.swDash} style={{ borderColor: color }} />;
  if (swatch === "outline") return <i className={s.swOutline} style={{ borderColor: color }} />;
  if (swatch === "ramp") return <i className={s.swRamp} style={{ background: color }} />;
  return <i className={s.swFill} style={{ background: color }} />;
}
