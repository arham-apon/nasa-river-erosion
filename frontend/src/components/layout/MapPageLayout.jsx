import { useState } from "react";
import { ChevronUp } from "lucide-react";
import s from "./mapPage.module.css";

export default function MapPageLayout({ panel, sheetLabel, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.page}>
      <aside className={s.panel} data-open={open}>
        <button type="button" className={s.handle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{sheetLabel}</span>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <div className={s.body}>{panel}</div>
      </aside>
      <div className={s.mapArea}>{children}</div>
    </div>
  );
}
