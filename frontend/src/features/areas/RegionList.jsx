import { useTranslation } from "react-i18next";
import RiskLabel from "../../components/ui/RiskLabel.jsx";
import { fmtNum } from "../../lib/format.js";
import p from "./panel.module.css";

export default function RegionList({ region, unions, onSelect, hovered, onHover }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className={p.block}>
      <div className={p.labelRow}>
        <h2 className={p.label}>{t("area.listTitle", { region: t(`regions.${region}.name`) })}</h2>
        <span className={p.labelAside}>{t("area.listAside")}</span>
      </div>
      <p className={p.body} style={{ marginBottom: 12 }}>
        {t("area.listIntro")}
      </p>
      <ul className={p.rows}>
        {unions.map((u) => (
          <li key={u.key}>
            <button
              type="button"
              className={p.row}
              data-hover={hovered === u.key}
              onClick={() => onSelect(u.key)}
              onMouseEnter={() => onHover(u.key)}
              onMouseLeave={() => onHover(null)}
            >
              <span className={p.rank}>{fmtNum(u.rankRegion, lang)}</span>
              <span className={p.rowName}>
                {u.name}
                <span className={p.rowMeta}>
                  {t("area.sectionsMeta", {
                    count: u.sections,
                    n: fmtNum(u.sections, lang),
                    high: fmtNum(u.highSections, lang),
                  })}
                </span>
              </span>
              <RiskLabel level={u.level} kind="priority" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
