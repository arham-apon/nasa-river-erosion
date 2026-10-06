import { useTranslation } from "react-i18next";
import BarChart from "./BarChart.jsx";
import Disclosure from "../../components/ui/Disclosure.jsx";
import { fmtNum, fmtYear } from "../../lib/format.js";
import c from "./chart.module.css";

export function ChartKey({ targetHa }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={c.key}>
      <span>
        <i style={{ background: "var(--erosion)" }} /> {t("chart.eroded")}
      </span>
      <span>
        <i style={{ background: "repeating-linear-gradient(45deg, var(--erosion) 0 2px, #0b0f13 2px 3.6px)" }} />{" "}
        {t("chart.settlement")}
      </span>
      {targetHa != null && (
        <span>
          <i style={{ height: 0, borderTop: "1.5px dashed var(--text-2)" }} />{" "}
          {t("chart.threshold", { ha: fmtNum(targetHa, i18n.language) })}
        </span>
      )}
    </div>
  );
}

export default function SectionHistory({ history, sectionId, targetHa, highlightYear, onSelectYear }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const sec = history?.sections?.[sectionId];
  if (!sec) return <p className={c.caption}>{t("section.noHistory")}</p>;
  const years = history.years;
  const hi = highlightYear != null ? years.indexOf(highlightYear) : -1;
  return (
    <div>
      <BarChart
        years={years}
        values={sec.e}
        subset={sec.s}
        threshold={targetHa}
        thresholdLabel={`${fmtNum(targetHa, lang)} ${t("units.ha")}`}
        unit={t("units.ha")}
        lang={lang}
        highlight={hi >= 0 ? hi : undefined}
        onSelect={onSelectYear ? (i) => onSelectYear(years[i]) : undefined}
        ariaLabel={t("chart.sectionAria", { from: years[0], to: years.at(-1) })}
      />
      <ChartKey targetHa={targetHa} />
      <Disclosure title={t("chart.table")}>
        <table className={c.table}>
          <thead>
            <tr>
              <th>{t("chart.monsoon")}</th>
              <th>{t("chart.erodedHa")}</th>
              <th>{t("chart.settlementHa")}</th>
              <th>{t("chart.retreatM")}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => (
              <tr key={y}>
                <td>{fmtYear(y, lang)}</td>
                <td>{fmtNum(sec.e[i], lang, 2)}</td>
                <td>{fmtNum(sec.s[i], lang, 2)}</td>
                <td>{fmtNum(sec.r[i], lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={c.caption}>{t("chart.retreatNote")}</p>
      </Disclosure>
    </div>
  );
}
