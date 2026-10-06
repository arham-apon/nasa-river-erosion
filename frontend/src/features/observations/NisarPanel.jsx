import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Tag from "../../components/ui/Tag.jsx";
import Disclosure from "../../components/ui/Disclosure.jsx";
import RiskLabel from "../../components/ui/RiskLabel.jsx";
import { QueryGate } from "../../components/ui/StateView.jsx";
import TimelineChart from "./TimelineChart.jsx";
import { dayNumber, fmtDate, fmtNum, fmtPct } from "../../lib/format.js";
import p from "../areas/panel.module.css";
import c from "../history/chart.module.css";

export default function NisarPanel({ manifest, region, nisar, forecast, layers, onLayers }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const obs = nisar.data;

  const byClass = useMemo(() => {
    if (!forecast.data) return null;
    return ["High", "Medium", "Low"].map((level) => {
      const rows = forecast.data.features.filter((f) => f.properties.risk === level && f.properties.nisarMajor != null);
      const major = rows.filter((f) => f.properties.nisarMajor === 1).length;
      return { level, n: rows.length, major, share: rows.length ? major / rows.length : null };
    });
  }, [forecast.data]);

  const gaps = useMemo(() => {
    if (!obs) return 0;
    let missed = 0;
    for (let i = 1; i < obs.timeline.length; i++) {
      missed += Math.round((dayNumber(obs.timeline[i].date) - dayNumber(obs.timeline[i - 1].date)) / 12) - 1;
    }
    return missed;
  }, [obs]);

  return (
    <QueryGate queries={nisar}>
      {obs && (
        <>
          <div className={p.block}>
            <Tag tone="provisional">{t("tags.provisional")}</Tag>
            <h2 className={p.title} style={{ marginTop: 10 }}>
              {t("nisar.title")}
            </h2>
            <p className={p.sub}>
              {t("nisar.passes", {
                n: fmtNum(obs.timeline.length, lang),
                from: fmtDate(obs.timeline[0].date, lang, { day: "numeric", month: "short" }),
                to: fmtDate(obs.timeline.at(-1).date, lang),
              })}
              {gaps > 0 && ` · ${t("nisar.missed", { count: gaps, n: fmtNum(gaps, lang) })}`}
            </p>
            <p className={p.body} style={{ marginTop: 10 }}>
              {t("nisar.explain", { date: fmtDate(obs.geometryDate, lang) })}
            </p>
          </div>

          <div className={p.block}>
            <h3 className={p.label} style={{ marginBottom: 8 }}>
              {t("nisar.chartTitle")}
            </h3>
            <TimelineChart
              points={obs.timeline}
              lang={lang}
              markDate={obs.geometryDate}
              markLabel={t("nisar.mapDate")}
              ariaLabel={t("nisar.chartAria")}
              series={[
                { key: "waterHa", color: "var(--water)", short: t("nisar.water") },
                { key: "dryLandUnderWaterHa", color: "var(--erosion)", short: t("nisar.landUnder") },
              ]}
            />
            <div className={c.key}>
              <span>
                <i style={{ height: 2, background: "var(--water)" }} /> {t("nisar.waterLong")}
              </span>
              <span>
                <i style={{ height: 2, background: "var(--erosion)" }} /> {t("nisar.landUnderLong")}
              </span>
              <span>
                <i style={{ height: 0, borderTop: "1.5px dotted var(--text-2)" }} /> {t("nisar.gap")}
              </span>
            </div>
            <dl className={p.kv} style={{ marginTop: 12 }}>
              <dt>{t("nisar.mappedTotal")}</dt>
              <dd>
                {fmtNum(obs.mapped.totalHa, lang)} {t("units.ha")}
              </dd>
              <dt>{t("nisar.mappedShown", { min: fmtNum(manifest.display.nisarMinHa, lang) })}</dt>
              <dd>
                {fmtNum(obs.mapped.displayedHa, lang)} {t("units.ha")}
              </dd>
              <dt>{t("nisar.settlementPart")}</dt>
              <dd>
                {fmtNum(obs.mapped.settlementHa, lang)} {t("units.ha")}
              </dd>
            </dl>
          </div>

          <div className={p.block}>
            <h3 className={p.label} style={{ marginBottom: 6 }}>
              {t("nisar.checkTitle")}
            </h3>
            <p className={p.body} style={{ marginBottom: 10 }}>
              {t("nisar.checkIntro", { ha: fmtNum(manifest.targetHa, lang) })}
            </p>
            {byClass && (
              <table className={c.table}>
                <thead>
                  <tr>
                    <th>{t("nisar.class")}</th>
                    <th>{t("nisar.sections")}</th>
                    <th>{t("nisar.withMajor")}</th>
                    <th>{t("nisar.share")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byClass.map((r) => (
                    <tr key={r.level}>
                      <td>
                        <RiskLabel level={r.level} />
                      </td>
                      <td>{fmtNum(r.n, lang)}</td>
                      <td>{fmtNum(r.major, lang)}</td>
                      <td>{fmtPct(r.share, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={c.caption}>{t("nisar.checkCaption")}</p>
            <fieldset className={p.chips} style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
              <legend className="visually-hidden">{t("nisar.layers")}</legend>
              <label className={p.chip} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={layers.patches} onChange={(e) => onLayers({ ...layers, patches: e.target.checked })} />
                {t("nisar.layerPatches")}
              </label>
              <label className={p.chip} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={layers.check} onChange={(e) => onLayers({ ...layers, check: e.target.checked })} />
                {t("nisar.layerCheck")}
              </label>
            </fieldset>
          </div>

          <div className={p.block}>
            <p className={p.body} style={{ color: "var(--text-3)" }}>
              {manifest.nisar.framesAvailable ? null : t("nisar.noFrames")}
            </p>
            <Disclosure title={t("nisar.aboutTitle")}>
              <p>{t("nisar.aboutBody")}</p>
              <p style={{ marginTop: 8 }}>{t("nisar.aboutMetrics")}</p>
            </Disclosure>
          </div>
        </>
      )}
    </QueryGate>
  );
}
