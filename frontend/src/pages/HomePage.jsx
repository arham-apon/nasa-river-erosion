import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Play } from "lucide-react";
import Segmented from "../components/ui/Segmented.jsx";
import Tag from "../components/ui/Tag.jsx";
import UnionSearch from "../components/ui/UnionSearch.jsx";
import Button from "../components/ui/Button.jsx";
import { ErrorState } from "../components/ui/StateView.jsx";
import { useCountry, useManifest, useUnions } from "../data/queries.js";
import { unionsOfRegion } from "../data/selectors.js";
import { useDemo } from "../features/demo/DemoContext.jsx";
import { fmtDate, fmtNum, fmtYear } from "../lib/format.js";
import s from "./home.module.css";

const BangladeshScene = lazy(() => import("../features/home/BangladeshScene.jsx"));

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const demo = useDemo();
  const manifest = useManifest();
  const unions = useUnions();
  const country = useCountry();
  const [region, setRegion] = useState("sirajganj");
  const [hovered, setHovered] = useState(null);

  const m = manifest.data;
  const list = useMemo(() => unionsOfRegion(unions.data, region), [unions.data, region]);
  const regionText = useMemo(
    () => ({ river: (n) => t(`rivers.${n}`, n), region: (id) => t(`regions.${id}.name`) }),
    [t],
  );

  if (manifest.isError) return <ErrorState error={manifest.error} onRetry={manifest.refetch} />;

  const regionIds = m ? Object.keys(m.regions) : [];
  const highSections = regionIds.reduce((sum, r) => sum + m.regions[r].highSections, 0);
  const totalSections = regionIds.reduce((sum, r) => sum + m.regions[r].sections, 0);
  const lastMonsoon = m ? Math.max(...m.regions[regionIds[0]].erosionYears) : null;
  const lastMonsoonHa = regionIds.reduce(
    (sum, r) => sum + (m.regions[r].erosionByMonsoon.find((e) => e.monsoon === lastMonsoon)?.totalMappedHa ?? 0),
    0,
  );
  const open = (u) => navigate(`/my-area?region=${region}&union=${u.key}`);

  return (
    <div className={s.home}>
      <section className={s.intro}>
        {m && (
          <div className={s.kicker}>
            <Tag tone="forecast">{t("tags.forecastSeason", { season: fmtYear(m.forecastSeason, lang) })}</Tag>
            <span className={s.kickerDate}>{t("app.dataTo", { date: fmtDate(m.snapshotId, lang) })}</span>
          </div>
        )}
        <h1 className={s.title}>{t("home.title")}</h1>
        <p className={s.lede}>
          {t("home.lede", {
            sections: fmtNum(totalSections || 542, lang),
            length: fmtNum(m?.segmentLengthM ?? 500, lang),
          })}
        </p>

        <div className={s.finder}>
          <h2 className={s.label}>{t("home.findArea")}</h2>
          {m && (
            <Segmented
              block
              label={t("common.region")}
              value={region}
              onChange={setRegion}
              options={regionIds.map((r) => ({
                value: r,
                label: t(`regions.${r}.name`),
                sub: t("home.unionCount", { count: m.regions[r].unions, n: fmtNum(m.regions[r].unions, lang) }),
              }))}
            />
          )}
          <UnionSearch
            unions={list}
            onSelect={open}
            placeholder={t("home.searchPlaceholder", { region: t(`regions.${region}.name`) })}
          />
          {list.length > 0 && (
            <p className={s.quick}>
              <span>{t("home.highestHere")}</span>{" "}
              {list.slice(0, 3).map((u, i) => (
                <span key={u.key}>
                  {i > 0 && <span className={s.sep}> · </span>}
                  <Link to={`/my-area?region=${region}&union=${u.key}`}>{u.name}</Link>
                </span>
              ))}
            </p>
          )}
        </div>

        {m && (
          <dl className={s.figures}>
            <div>
              <dd className={s.figure}>{fmtNum(highSections, lang)}</dd>
              <dt>{t("home.figHigh")}</dt>
              <span className={s.figNote}>{t("home.figHighNote", { season: fmtYear(m.forecastSeason, lang) })}</span>
            </div>
            <div>
              <dd className={s.figure}>
                {fmtNum(lastMonsoonHa, lang)} <span className={s.unit}>{t("units.ha")}</span>
              </dd>
              <dt>{t("home.figErosion", { year: fmtYear(lastMonsoon, lang) })}</dt>
              <span className={s.figNote}>{t("home.figErosionNote")}</span>
            </div>
            <div>
              <dd className={s.figure}>{fmtNum(m.nisar.dates.length, lang)}</dd>
              <dt>{t("home.figNisar")}</dt>
              <span className={s.figNote}>
                {fmtDate(m.nisar.dates[0], lang, { day: "numeric", month: "short" })} –{" "}
                {fmtDate(m.nisar.latestDate, lang)} · {t("tags.provisional")}
              </span>
            </div>
          </dl>
        )}

        <div className={s.actions}>
          <Button variant="primary" onClick={demo.start}>
            <Play size={14} /> {t("home.tour")}
          </Button>
          <Button variant="quiet" to="/how-it-works">
            {t("home.howRanking")} <ArrowRight size={14} />
          </Button>
        </div>

        <p className={s.fine}>{t("common.notHouseLevel")}</p>
      </section>

      <section className={s.stage} aria-label={t("home.sceneLabel")}>
        {country.data && (
          <Suspense fallback={null}>
            <BangladeshScene
              data={country.data}
              lang={lang}
              selected={region}
              hovered={hovered}
              onHover={setHovered}
              onSelect={setRegion}
              regionText={regionText}
            />
          </Suspense>
        )}
        <div className={s.stageHead}>
          <span className={s.label}>{t("home.sceneTitle")}</span>
        </div>
        <ul className={s.legend}>
          <li>
            <i className={s.lgRiver} /> {t("home.legendRiver")}
          </li>
          <li>
            <i className={s.lgReach} /> {t("home.legendReach")}
          </li>
          <li>
            <i className={s.lgBank} /> {t("home.legendBank", { year: m ? fmtYear(Math.max(...m.regions[regionIds[0]].bankYears), lang) : "" })}
          </li>
          <li>
            <i className={s.lgCity} /> {t("home.legendCity")}
          </li>
        </ul>
        <p className={s.hint}>{t("home.sceneHint")}</p>
      </section>
    </div>
  );
}
