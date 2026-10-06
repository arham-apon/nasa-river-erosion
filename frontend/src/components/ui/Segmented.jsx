import s from "./ui.module.css";

export default function Segmented({ options, value, onChange, label, block = false }) {
  const onKey = (e) => {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div className={`${s.segmented} ${block ? s.block : ""}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={s.segment}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.label}
          {o.sub && <span className={s.segmentSub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
