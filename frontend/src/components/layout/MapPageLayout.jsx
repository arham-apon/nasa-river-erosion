import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp } from "lucide-react";
import { SplitHandle, useSplit } from "./Split.jsx";
import s from "./mapPage.module.css";

const PANEL_DEFAULT = () => 384;

export default function MapPageLayout({ panel, sheetLabel, children }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const split = useSplit({ storageKey: "rw-split-map", initial: PANEL_DEFAULT, min: 320, max: 640, minRight: 420 });
  return (
    <div className={s.page} ref={split.ref} style={split.style}>
      <aside className={s.panel} data-open={open}>
        <button type="button" className={s.handle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{sheetLabel}</span>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <div className={s.body}>{panel}</div>
      </aside>
      <SplitHandle split={split} label={t("layout.resizePanel")} />
      <div className={s.mapArea}>{children}</div>
    </div>
  );
}
