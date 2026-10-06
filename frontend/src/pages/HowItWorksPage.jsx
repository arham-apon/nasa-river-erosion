import { useTranslation } from "react-i18next";
import Disclosure from "../components/ui/Disclosure.jsx";
import Tag from "../components/ui/Tag.jsx";
import { QueryGate } from "../components/ui/StateView.jsx";
import MetricsTable from "../features/evidence/MetricsTable.jsx";
import { useEvaluation, useManifest } from "../data/queries.js";
import { fmtDate, fmtNum, fmtPct, fmtYear } from "../lib/format.js";
import s from "./docs.module.css";

const SECTIONS = ["process", "meaning", "past", "regions", "nisar", "drivers", "priority", "definitions", "limits"];
const STEPS = ["radar", "landmap", "banks", "erosion", "sections", "model"];

export default function HowItWorksPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ev = useEvaluation();
  const manifest = useManifest();

  return (
    <div className={s.page}>
      <nav className={s.toc} aria-label={t("how.toc")}>
        <div className={s.tocTitle}>{t("how.toc")}</div>
        {SECTIONS.map((id) => (
          <a key={id} href={`#${id}`}>
            {t(`how.${id}.title`)}
          </a>
        ))}
      </nav>

      <article className={s.content}>
        <h1 className={s.pageTitle}>{t("how.title")}</h1>
        <p className={s.lede}>{t("how.lede")}</p>

        <QueryGate queries={[ev, manifest]}>
          {ev.data && manifest.data && <Body ev={ev.data} m={manifest.data} t={t} lang={lang} />}
        </QueryGate>
      </article>
    </div>
  );
}

function Body({ ev, m, t, lang }) {
  const ts = ev.timeSplit;
  const gbm = ts.rows.find((r) => r.model === "gradient boosting");
  const pers = ts.rows.find((r) => r.model === "persistence");
  const rand = ts.rows.find((r) => r.model === "random");
  const nisarBoth = ev.nisarCheck.filter((r) => r.scope === "both");
  const shares = nisarBoth[0];
  const importance = ev.featureImportance;
  const maxImp = Math.max(...importance.map((f) => f.importance));
  const w = m.priorityWeights;
  const crossDirections = [...new Set(ev.crossRegion.map((r) => `${r.trainRegion}->${r.testRegion}`))];

  return (
    <>
      <section id="process" className={s.section}>
        <h2>{t("how.process.title")}</h2>
        <p>{t("how.process.body")}</p>
        <ol className={s.steps}>
          {STEPS.map((k) => (
            <li key={k}>
              <h3>{t(`how.steps.${k}.title`)}</h3>
              <p>{t(`how.steps.${k}.body`)}</p>
              <span className={s.stepSource}>{t(`how.steps.${k}.source`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="meaning" className={s.section}>
        <h2>{t("how.meaning.title")}</h2>
        <p>{t("how.meaning.body1", { ha: fmtNum(m.targetHa, lang), len: fmtNum(m.segmentLengthM, lang) })}</p>
        <p>{t("how.meaning.body2")}</p>
        <div className={s.callout}>{t("common.notHouseLevel")}</div>
      </section>

      <section id="past" className={s.section}>
        <h2>{t("how.past.title")}</h2>
        <p>
          {t("how.past.body", {
            last: fmtYear(ts.trainLast, lang),
            from: fmtYear(ts.testYears[0], lang),
            to: fmtYear(ts.testYears.at(-1), lang),
            events: fmtNum(gbm.positives, lang),
            rows: fmtNum(gbm.rows, lang),
          })}
        </p>
        <MetricsTable rows={ts.rows} caption={t("how.past.caption")} />
        <p style={{ marginTop: 16 }}>
          {t("how.past.reading", {
            gbm: fmtPct(gbm.recall_top20, lang),
            pers: fmtPct(pers.recall_top20, lang),
            rand: fmtPct(rand.recall_top20, lang),
            gbmAuc: fmtNum(gbm.pr_auc, lang, 3),
            persAuc: fmtNum(pers.pr_auc, lang, 3),
          })}
        </p>
        <Disclosure title={t("how.past.metricsHelp")}>
          <p>{t("how.past.metricsHelpBody")}</p>
        </Disclosure>
      </section>

      <section id="regions" className={s.section}>
        <h2>{t("how.regions.title")}</h2>
        <p>{t("how.regions.body")}</p>
        <Disclosure title={t("how.regions.tables")}>
          {crossDirections.map((d) => {
            const [a, b] = d.split("->");
            return (
              <div key={d} style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "8px 0 0" }}>
                  {t("how.regions.direction", { train: t(`regions.${a}.name`), test: t(`regions.${b}.name`) })}
                </h3>
                <MetricsTable rows={ev.crossRegion.filter((r) => r.trainRegion === a && r.testRegion === b)} />
              </div>
            );
          })}
        </Disclosure>
      </section>

      <section id="nisar" className={s.section}>
        <h2>
          {t("how.nisar.title")} <Tag tone="provisional">{t("tags.provisional")}</Tag>
        </h2>
        <p>{t("how.nisar.body", { date: fmtDate(m.nisar.latestDate, lang), n: fmtNum(m.nisar.dates.length, lang) })}</p>
        <MetricsTable rows={nisarBoth} caption={t("how.nisar.caption", { events: fmtNum(shares.major_nisar, lang), n: fmtNum(shares.stretches, lang) })} />
        <p style={{ marginTop: 16 }}>
          {t("how.nisar.shares", {
            high: fmtPct(shares.major_share_high, lang),
            medium: fmtPct(shares.major_share_medium, lang),
            low: fmtPct(shares.major_share_low, lang),
          })}
        </p>
        <div className={s.callout}>{t("how.nisar.alignment")}</div>
        <Disclosure title={t("how.nisar.byRegion")}>
          {Object.keys(m.regions).map((r) => (
            <div key={r} style={{ marginBottom: 12 }}>
              <h3 style={{ margin: "8px 0 0" }}>{t(`regions.${r}.name`)}</h3>
              <MetricsTable rows={ev.nisarCheck.filter((x) => x.scope === r)} />
            </div>
          ))}
        </Disclosure>
      </section>

      <section id="drivers" className={s.section}>
        <h2>{t("how.drivers.title")}</h2>
        <p>{t("how.drivers.body")}</p>
        <ul className={s.bars}>
          {importance
            .filter((f) => f.importance > 0.002)
            .map((f) => (
              <li key={f.feature}>
                <span style={{ textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text)" }}>
                  {t(`features.${f.feature}`, f.feature)}
                </span>
                <i>
                  <b style={{ width: `${(f.importance / maxImp) * 100}%` }} />
                </i>
                <span>{fmtNum(f.importance, lang, 3)}</span>
              </li>
            ))}
        </ul>
        <p style={{ marginTop: 16 }}>{t("how.drivers.caution")}</p>
        <Disclosure title={t("how.drivers.all")}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{t("how.drivers.feature")}</th>
                <th>{t("how.drivers.code")}</th>
                <th>{t("how.drivers.drop")}</th>
              </tr>
            </thead>
            <tbody>
              {importance.map((f) => (
                <tr key={f.feature}>
                  <td>{t(`features.${f.feature}`, f.feature)}</td>
                  <td className="mono" style={{ color: "var(--text-3)" }}>
                    {f.feature}
                  </td>
                  <td className="mono">{fmtNum(f.importance, lang, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      </section>

      <section id="priority" className={s.section}>
        <h2>{t("how.priority.title")}</h2>
        <p>{t("how.priority.body")}</p>
        <div className={s.callout}>
          <span className="mono">
            {t("area.formulaSection", {
              risk: fmtNum(w.risk, lang, 1),
              retreat: fmtNum(w.retreat, lang, 1),
              pop: fmtNum(w.population, lang, 1),
              bldg: fmtNum(w.buildings, lang, 1),
            })}
          </span>
          <br />
          <span className="mono">{t("area.formulaUnion")}</span>
        </div>
        <p style={{ marginTop: 16 }}>{t("how.priority.levels")}</p>
        <p>{t("area.howPriorityFoot")}</p>
      </section>

      <section id="definitions" className={s.section}>
        <h2>{t("how.definitions.title")}</h2>
        <dl className={s.defs}>
          {["bankline", "monsoon", "forecastSeason", "nisarObs", "section", "hectare", "exposure"].map((k) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{t(`how.definitions.${k}.term`)}</dt>
              <dd>{t(`how.definitions.${k}.def`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="limits" className={s.section}>
        <h2>{t("how.limits.title")}</h2>
        <ul className={s.list}>
          {["years", "relative", "settlement", "exposure", "weights", "nisar", "coverage"].map((k) => (
            <li key={k}>{t(`how.limits.${k}`)}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
