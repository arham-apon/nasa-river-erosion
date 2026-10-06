import { useTranslation } from "react-i18next";
import { ArrowRight, X } from "lucide-react";
import Tag from "../../components/ui/Tag.jsx";
import Button from "../../components/ui/Button.jsx";
import Disclosure from "../../components/ui/Disclosure.jsx";
import BarChart from "./BarChart.jsx";
import SectionHistory, { ChartKey } from "./SectionHistory.jsx";
import { QueryGate } from "../../components/ui/StateView.jsx";
import { fmtDate, fmtNum, fmtYear } from "../../lib/format.js";
import { sideLabelKey } from "../../data/selectors.js";
import p from "../areas/panel.module.css";
import c from "./chart.module.css";

export default function BankHistoryPanel({ manifest, region, bank, compare, history, section, onYear, onClearSection, tilt }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const monsoon = bank - 1;
  const erosionRow = history.data?.erosion.find((e) => e.monsoon === monsoon);
  const win = {
    from: fmtDate(`${bank - 1}-11-01`, lang, { month: "short", year: "numeric" }),
    to: fmtDate(`${bank}-04-01`, lang, { month: "short", year: "numeric" }),
  };

  return (
    <>
      <div className={p.block}>
        <Tag tone="observed">{t("tags.historical")}</Tag>
        <h2 className={p.title} style={{ marginTop: 10 }}>
          {t("river.banklineTitle", { year: fmtYear(bank, lang) })}
        </h2>
        <p className={p.sub}>{t("river.window", win)}</p>
        <p className={p.body} style={{ marginTop: 10 }}>
          {compare
            ? t("river.compareSentence", { year: fmtYear(compare, lang) })
            : t("river.noCompareSentence")}{" "}
          {erosionRow
            ? t("river.erosionSentence", {
                monsoon: fmtYear(monsoon, lang),
                prev: fmtYear(bank - 1, lang),
                year: fmtYear(bank, lang),
                min: fmtNum(manifest.display.erosionMinHa, lang),
              })
            : t("river.noErosionSentence")}
        </p>
        {tilt && <p className={p.body} style={{ marginTop: 8, color: "var(--water-strong)" }}>{t("river.stackSentence")}</p>}
      </div>

      <div className={p.block}>
        <QueryGate queries={history}>
          {history.data && (
            <>
              <div className={p.labelRow}>
                <h3 className={p.label}>{t("river.regionChartTitle")}</h3>
                <span className={p.labelAside}>{t(`regions.${region}.name`)}</span>
              </div>
              <BarChart
                years={history.data.erosion.map((e) => e.monsoon)}
                values={history.data.erosion.map((e) => e.totalMappedHa)}
                subset={history.data.erosion.map((e) => e.settlementMappedHa)}
                highlight={history.data.erosion.findIndex((e) => e.monsoon === monsoon)}
                onSelect={(i) => onYear(history.data.erosion[i].monsoon + 1)}
                unit={t("units.ha")}
                lang={lang}
                digits={0}
                ariaLabel={t("river.regionChartAria")}
              />
              <ChartKey />
              <p className={c.caption}>
                {erosionRow
                  ? t("river.regionChartCaption", {
                      monsoon: fmtYear(monsoon, lang),
                      shown: fmtNum(erosionRow.displayedHa, lang),
                      total: fmtNum(erosionRow.totalMappedHa, lang),
                      min: fmtNum(manifest.display.erosionMinHa, lang),
                    })
                  : t("river.regionChartCaptionGeneric")}
              </p>
            </>
          )}
        </QueryGate>
      </div>

      <div className={p.block}>
        {section ? (
          <>
            <div className={p.labelRow}>
              <h3 className={p.label}>
                {t(sideLabelKey(section.side))} · {t("section.number", { n: fmtNum(section.segment, lang) })}
              </h3>
              <button type="button" className={p.back} style={{ margin: 0 }} onClick={onClearSection} aria-label={t("river.clearSection")}>
                <X size={14} />
              </button>
            </div>
            <p className={p.sub} style={{ marginBottom: 10 }}>
              {section.unionName ? t("section.inUnion", { union: section.unionName }) : ""}
            </p>
            <SectionHistory
              history={history.data}
              sectionId={section.id}
              targetHa={manifest.targetHa}
              highlightYear={monsoon}
              onSelectYear={(y) => onYear(y + 1)}
            />
            <div className={p.linkRow} style={{ marginTop: 12 }}>
              <Button to={`/my-area?region=${region}&union=${section.union ?? ""}&section=${section.id}`}>
                {t("river.sectionForecast")} <ArrowRight size={14} />
              </Button>
            </div>
          </>
        ) : (
          <p className={p.body}>{t("river.pickSection")}</p>
        )}
      </div>

      <div className={p.block}>
        <Disclosure title={t("river.aboutTitle")}>
          <p>{t("river.aboutBankline")}</p>
          <p style={{ marginTop: 8 }}>{t("river.aboutErosion")}</p>
          <p style={{ marginTop: 8 }}>{t("river.aboutSum")}</p>
        </Disclosure>
      </div>
    </>
  );
}
