import { Trans, useTranslation } from "react-i18next";
import { QueryGate } from "../components/ui/StateView.jsx";
import { useManifest } from "../data/queries.js";
import { fmtDate, fmtNum, fmtYear } from "../lib/format.js";
import s from "./docs.module.css";

const SOURCES = [
  { name: "Copernicus Sentinel-1", key: "s1", credit: "ESA / Copernicus, via Google Earth Engine" },
  { name: "NISAR L2 GCOV (provisional)", key: "nisar", credit: "NASA / ISRO, via ASF DAAC" },
  { name: "Sentinel-2", key: "s2", credit: "ESA / Copernicus" },
  { name: "JRC Global Surface Water", key: "jrc", credit: "EC JRC / Google" },
  { name: "Dynamic World", key: "dw", credit: "Google / World Resources Institute" },
  { name: "MERIT Hydro (HAND)", key: "merit", credit: "Yamazaki et al." },
  { name: "Google Open Buildings v3", key: "buildings", credit: "Google Research" },
  { name: "WorldPop 2020", key: "worldpop", credit: "WorldPop, University of Southampton" },
  { name: "geoBoundaries", key: "geob", credit: "William & Mary geoLab" },
  { name: "Natural Earth", key: "ne", credit: "Natural Earth (public domain)" },
  { name: "Basemaps", key: "basemap", credit: "OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors; imagery © Esri, Maxar, Earthstar Geographics" },
];

export default function AboutPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const manifest = useManifest();
  const m = manifest.data;

  return (
    <div className={`${s.page} ${s.about}`}>
      <nav className={`${s.toc} ${s.aboutToc}`} aria-label={t("how.toc")}>
        <div className={s.tocTitle}>{t("how.toc")}</div>
        {["what", "coverage", "sources", "method", "code"].map((id) => (
          <a key={id} href={`#about-${id}`}>
            {t(`about.${id}.title`)}
          </a>
        ))}
      </nav>
      <article className={s.content}>
        <h1 className={s.pageTitle}>
          <Trans i18nKey="about.title" components={{ hl: <span className="hl" /> }} />
        </h1>
        <p className={s.lede}>{t("about.lede")}</p>

        <QueryGate queries={manifest}>
          {m && (
            <>
              <section id="about-what" className={s.section}>
                <span id="what" className="visually-hidden" />
                <h2>{t("about.what.title")}</h2>
                <p>{t("about.what.body1")}</p>
                <p>{t("about.what.body2")}</p>
              </section>

              <section id="about-coverage" className={s.section}>
                <span id="coverage" className="visually-hidden" />
                <h2>{t("about.coverage.title")}</h2>
                <p>{t("about.coverage.body")}</p>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>{t("common.region")}</th>
                        <th>{t("about.coverage.box")}</th>
                        <th>{t("about.coverage.sections")}</th>
                        <th>{t("about.coverage.unions")}</th>
                        <th>{t("about.coverage.banks")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(m.regions).map(([id, r]) => (
                        <tr key={id}>
                          <td>{t(`regions.${id}.name`)}</td>
                          <td className="mono" style={{ fontSize: "var(--fs-caption)" }}>
                            {r.bbox[0]}–{r.bbox[2]}°E, {r.bbox[1]}–{r.bbox[3]}°N
                          </td>
                          <td className="mono">{fmtNum(r.sections, lang)}</td>
                          <td className="mono">{fmtNum(r.unions, lang)}</td>
                          <td className="mono">
                            {fmtYear(r.bankYears[0], lang)}–{fmtYear(r.bankYears.at(-1), lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className={s.defs}>
                  <dt>{t("about.coverage.forecast")}</dt>
                  <dd>{t("about.coverage.forecastVal", { season: fmtYear(m.forecastSeason, lang) })}</dd>
                  <dt>{t("about.coverage.nisar")}</dt>
                  <dd>
                    {m.nisar.dates.map((d) => fmtDate(d, lang, { day: "numeric", month: "short" })).join(" · ")}{" "}
                    {fmtYear(2026, lang)}
                  </dd>
                  <dt>{t("about.coverage.snapshot")}</dt>
                  <dd>
                    {t("about.coverage.snapshotVal", {
                      date: fmtDate(m.snapshotId, lang),
                      built: fmtDate(m.builtAt.slice(0, 10), lang),
                    })}
                  </dd>
                </dl>
              </section>

              <section id="about-sources" className={s.section}>
                <span id="sources" className="visually-hidden" />
                <h2>{t("about.sources.title")}</h2>
                <div className={s.tableWrap}>
                  <table className={`${s.table} ${s.sources}`}>
                    <thead>
                      <tr>
                        <th>{t("about.sources.source")}</th>
                        <th>{t("about.sources.use")}</th>
                        <th>{t("about.sources.credit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCES.map((src) => (
                        <tr key={src.key}>
                          <td>{src.name}</td>
                          <td>{t(`about.sources.uses.${src.key}`)}</td>
                          <td>{src.credit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="about-method" className={s.section}>
                <span id="method" className="visually-hidden" />
                <h2>{t("about.method.title")}</h2>
                <p>
                  {t("about.method.body")}{" "}
                  <a href="https://nhess.copernicus.org/articles/23/751/2023/" target="_blank" rel="noreferrer">
                    Freihardt &amp; Frey (2023), NHESS 23, 751–770
                  </a>
                  .
                </p>
              </section>

              <section id="about-code" className={s.section}>
                <span id="code" className="visually-hidden" />
                <h2>{t("about.code.title")}</h2>
                <p>
                  {t("about.code.body")}{" "}
                  <a href="https://github.com/arham-apon/nasa-river-erosion" target="_blank" rel="noreferrer">
                    github.com/arham-apon/nasa-river-erosion
                  </a>
                </p>
                <p>{t("about.code.review")}</p>
              </section>
            </>
          )}
        </QueryGate>
      </article>
    </div>
  );
}
