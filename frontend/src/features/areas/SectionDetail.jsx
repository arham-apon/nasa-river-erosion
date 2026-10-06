import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import RiskLabel from "../../components/ui/RiskLabel.jsx";
import Tag from "../../components/ui/Tag.jsx";
import Button from "../../components/ui/Button.jsx";
import Disclosure from "../../components/ui/Disclosure.jsx";
import SectionHistory from "../history/SectionHistory.jsx";
import { fmtNum, fmtYear } from "../../lib/format.js";
import { sideLabelKey } from "../../data/selectors.js";
import p from "./panel.module.css";

export default function SectionDetail({ manifest, region, section, history, backLabel, onBack, compact = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const total = manifest.regions[region].sections;
  const sec = history?.sections?.[section.id];
  const lastMonsoon = history?.years.at(-1);

  return (
    <>
      <div className={p.block}>
        <button type="button" className={p.back} onClick={onBack}>
          <ArrowLeft size={14} /> {backLabel}
        </button>
        <h2 className={p.title}>
          {t(sideLabelKey(section.side))} · {t("section.number", { n: fmtNum(section.segment, lang) })}
        </h2>
        <p className={p.sub}>
          {section.unionName ? t("section.inUnion", { union: section.unionName }) + " · " : ""}
          {t(`regions.${region}.name`)}
        </p>
        <div className={p.tags}>
          <Tag tone="forecast">{t("tags.forecastSeason", { season: fmtYear(manifest.forecastSeason, lang) })}</Tag>
        </div>
        <p style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <RiskLabel level={section.risk} />
          <span className={p.body}>
            {t("section.rankLine", { rank: fmtNum(section.riskRank, lang), total: fmtNum(total, lang) })}
          </span>
        </p>
        <p className={p.body} style={{ marginTop: 6 }}>
          {t(`section.classMeaning.${section.risk}`)}
        </p>
      </div>

      <div className={p.block}>
        <div className={p.labelRow}>
          <h3 className={p.label}>{t("section.historyTitle")}</h3>
          <Tag tone="observed">{t("tags.historical")}</Tag>
        </div>
        <SectionHistory history={history} sectionId={section.id} targetHa={manifest.targetHa} />
      </div>

      <div className={p.block}>
        <dl className={p.kv}>
          <dt>{t("section.erodedLast", { year: fmtYear(lastMonsoon ?? 2025, lang) })}</dt>
          <dd>
            {fmtNum(section.erodedLastHa, lang, 1)} {t("units.ha")}
          </dd>
          <dt>{t("section.retreat")}</dt>
          <dd>
            {fmtNum(section.retreatRecentM, lang)} {t("units.m")}
          </dd>
          <dt>{t("section.people")}</dt>
          <dd>
            {fmtNum(section.population, lang)}
            <small>{t("area.peopleNote", { year: fmtYear(manifest.exposure.populationYear, lang) })}</small>
          </dd>
          <dt>{t("section.buildings")}</dt>
          <dd>
            {fmtNum(section.buildings, lang)}
            <small>{t("section.buildingsNote")}</small>
          </dd>
          <dt>{t("section.nisar")}</dt>
          <dd>
            {fmtNum(section.nisarHa, lang, 1)} {t("units.ha")}
            <small>{t("tags.provisional")}</small>
          </dd>
        </dl>
      </div>

      {sec?.h?.some((o) => o) && (
        <div className={p.block}>
          <h3 className={p.label} style={{ marginBottom: 8 }}>
            {t("section.hindcastTitle", {
              from: fmtYear(history.hindcastYears[0], lang),
              to: fmtYear(history.hindcastYears.at(-1), lang),
            })}
          </h3>
          <div className={p.chips}>
            {history.hindcastYears.map((y, i) => (
              <span key={y} className={p.chip} data-outcome={sec.h[i] ?? "none"}>
                <b>{fmtYear(y, lang)}</b>
                {sec.h[i] ? t(`outcome.${sec.h[i]}`) : "—"}
              </span>
            ))}
          </div>
          <p className={p.body} style={{ marginTop: 8 }}>
            {t("section.hindcastBody")}
          </p>
        </div>
      )}

      <div className={p.block}>
        <Disclosure title={t("section.technical")}>
          <dl className={p.kv}>
            <dt>{t("section.modelOutput")}</dt>
            <dd>{fmtNum(section.prob, lang, 3)}</dd>
            <dt>{t("section.priorityScore")}</dt>
            <dd>{fmtNum(section.score, lang, 3)}</dd>
            <dt>{t("section.id")}</dt>
            <dd>
              {region}:{section.id}
            </dd>
          </dl>
          <p style={{ marginTop: 8 }}>{t("section.modelOutputNote", { ha: fmtNum(manifest.targetHa, lang) })}</p>
        </Disclosure>
        {!compact && (
          <div className={p.linkRow} style={{ marginTop: 12 }}>
            <Button to={`/river-changes?region=${region}&section=${section.id}`}>
              {t("section.viewHistory")} <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
