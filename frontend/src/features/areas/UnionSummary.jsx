import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import RiskLabel from "../../components/ui/RiskLabel.jsx";
import Tag from "../../components/ui/Tag.jsx";
import Button from "../../components/ui/Button.jsx";
import Disclosure from "../../components/ui/Disclosure.jsx";
import { fmtDate, fmtNum, fmtYear } from "../../lib/format.js";
import { sideLabelKey } from "../../data/selectors.js";
import p from "./panel.module.css";

export default function UnionSummary({ manifest, region, union, sections, alert, onBack, onSection, hovered, onHover }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const season = fmtYear(manifest.forecastSeason, lang);
  const high = sections.filter((s) => s.risk === "High").length;
  const w = manifest.priorityWeights;

  return (
    <>
      <div className={p.block}>
        <button type="button" className={p.back} onClick={onBack}>
          <ArrowLeft size={14} /> {t("area.allUnions", { region: t(`regions.${region}.name`) })}
        </button>
        <h2 className={p.title}>{union.name}</h2>
        <p className={p.sub}>
          {t("area.rankLine", {
            rank: fmtNum(union.rankRegion, lang),
            total: fmtNum(union.regionCount, lang),
            region: t(`regions.${region}.name`),
          })}
        </p>
        <div className={p.tags}>
          <Tag tone="forecast">{t("tags.forecastSeason", { season })}</Tag>
        </div>

        <div className={p.primary}>
          <span className={p.label}>{t("area.priority")}</span>
          <span className={p.primaryValue}>
            <RiskLabel level={union.level} kind="priority" />
          </span>
          <span className={p.headNote}>{t("area.priorityNote")}</span>
        </div>
        <dl className={p.secondaryRow}>
          <div>
            <dt>{t("area.highSections")}</dt>
            <dd>{t("area.ofN", { n: fmtNum(high, lang), total: fmtNum(sections.length, lang) })}</dd>
            <span className={p.headNote}>{t("area.highSectionsNote")}</span>
          </div>
          <div>
            <dt>{t("area.people")}</dt>
            <dd>{fmtNum(union.population, lang)}</dd>
            <span className={p.headNote}>
              {t("area.peopleNote", { year: fmtYear(manifest.exposure.populationYear, lang) })}
            </span>
          </div>
        </dl>
        <p className={p.body}>{t(`area.levelSentence.${union.level}`)}</p>

        {alert ? (
          <div className={p.notice} role="note">
            <div className={p.noticeHead}>
              <strong>{t("area.noticeTitle")}</strong>
              <span>{t("area.noticeSeason", { season })}</span>
            </div>
            <p className={p.noticeText} lang="bn">
              {alert.textBn}
            </p>
            <p className={p.noticeFoot}>
              {t("area.noticeFoot", { date: fmtDate(alert.dataDate, lang) })}
            </p>
          </div>
        ) : (
          <p className={p.body} style={{ marginTop: 12, color: "var(--text-3)" }}>
            {t("area.noNotice")}
          </p>
        )}
      </div>

      <div className={p.block}>
        <div className={p.labelRow}>
          <h3 className={p.label}>{t("area.sectionsTitle", { n: fmtNum(sections.length, lang) })}</h3>
          <span className={p.labelAside}>{t("area.sortedByModel")}</span>
        </div>
        <ul className={p.rows}>
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={p.row}
                data-hover={hovered === s.id}
                onClick={() => onSection(s.id)}
                onMouseEnter={() => onHover(s.id)}
                onMouseLeave={() => onHover(null)}
              >
                <span className={p.rank}>{fmtNum(s.riskRank, lang)}</span>
                <span className={p.rowName}>
                  {t(sideLabelKey(s.side))} · {t("section.number", { n: fmtNum(s.segment, lang) })}
                  <span className={p.rowMeta}>
                    {t("area.erodedLast", { ha: fmtNum(s.erodedLastHa, lang, 1) })}
                  </span>
                </span>
                <RiskLabel level={s.risk} />
              </button>
            </li>
          ))}
        </ul>
        <div className={p.linkRow} style={{ marginTop: 16 }}>
          <Button to={`/river-changes?region=${region}&union=${union.key}`}>
            {t("area.seeChanges")} <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      <div className={p.block}>
        <Disclosure title={t("area.howPriority")}>
          <p>{t("area.howPriorityBody")}</p>
          <code className={p.formula}>
            {t("area.formulaSection", {
              risk: fmtNum(w.risk, lang, 1),
              retreat: fmtNum(w.retreat, lang, 1),
              pop: fmtNum(w.population, lang, 1),
              bldg: fmtNum(w.buildings, lang, 1),
            })}
          </code>
          <code className={p.formula}>{t("area.formulaUnion")}</code>
          <p>{t("area.howPriorityFoot")}</p>
        </Disclosure>
        <Disclosure title={t("area.exposureTitle")}>
          <dl className={p.kv}>
            <dt>{t("area.people")}</dt>
            <dd>{fmtNum(union.population, lang)}</dd>
            <dt>{t("area.buildings")}</dt>
            <dd>{fmtNum(union.buildings, lang)}</dd>
            <dt>{t("area.score")}</dt>
            <dd>{fmtNum(union.score, lang, 3)}</dd>
          </dl>
          <p style={{ marginTop: 8 }}>{t("area.exposureBody", { year: fmtYear(manifest.exposure.populationYear, lang) })}</p>
        </Disclosure>
      </div>
    </>
  );
}
