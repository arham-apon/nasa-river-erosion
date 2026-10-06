import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import s from "./split.module.css";

const read = (key) => {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};

const write = (key, v) => {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* not persisted; the width still applies for this visit */
  }
};

/** Width of the left column of a two-column layout, user-resizable and remembered per page. */
export function useSplit({ storageKey, initial, min, max, minRight }) {
  const ref = useRef(null);
  const [width, setRaw] = useState(() => read(storageKey) ?? initial());

  const clamp = useCallback(
    (w) => {
      const total = ref.current?.clientWidth || window.innerWidth;
      return Math.round(Math.max(min, Math.min(w, max, total - minRight)));
    },
    [min, max, minRight],
  );

  useEffect(() => {
    const fit = () => setRaw((w) => clamp(w));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [clamp]);

  const setWidth = useCallback((w, persist = true) => {
    setRaw((prev) => {
      const c = clamp(typeof w === "function" ? w(prev) : w);
      if (persist) write(storageKey, c);
      return c;
    });
  }, [clamp, storageKey]);

  const reset = useCallback(() => {
    write(storageKey, null);
    setRaw(clamp(initial()));
  }, [clamp, initial, storageKey]);

  return { ref, width, setWidth, reset, min, max, style: { "--split": `${width}px` } };
}

export function SplitHandle({ split, label }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const end = (e) => {
    if (!drag.current) return;
    split.setWidth(drag.current.w + e.clientX - drag.current.x, true);
    drag.current = null;
    setDragging(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

  return (
    <div
      className={s.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={split.width}
      aria-valuemin={split.min}
      aria-valuemax={split.max}
      tabIndex={0}
      data-dragging={dragging}
      title={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, w: split.width };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => drag.current && split.setWidth(drag.current.w + e.clientX - drag.current.x, false)}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={split.reset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 24;
        if (e.key === "ArrowLeft") split.setWidth((w) => w - step);
        else if (e.key === "ArrowRight") split.setWidth((w) => w + step);
        else if (e.key === "Home") split.setWidth(split.min);
        else if (e.key === "End") split.setWidth(split.max);
        else return;
        e.preventDefault();
      }}
    >
      <span className={s.grip}>
        <GripVertical size={12} aria-hidden="true" />
      </span>
    </div>
  );
}
