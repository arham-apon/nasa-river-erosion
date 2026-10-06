import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Trans, useTranslation } from "react-i18next";
import { ArrowRight, Play } from "lucide-react";
import Segmented from "../components/ui/Segmented.jsx";
import Tag from "../components/ui/Tag.jsx";
import UnionSearch from "../components/ui/UnionSearch.jsx";
import Button from "../components/ui/Button.jsx";
import { ErrorState } from "../components/ui/StateView.jsx";
import { SplitHandle, useSplit } from "../components/layout/Split.jsx";
import { useCountry, useEvaluation, useManifest, useUnions } from "../data/queries.js";
import { unionsOfRegion } from "../data/selectors.js";
import { useDemo } from "../features/demo/DemoContext.jsx";
import { fmtDate, fmtNum, fmtPct, fmtYear } from "../lib/format.js";
import { useMediaQuery } from "../lib/useMediaQuery.js";
import s from "./home.module.css";

const BangladeshScene = lazy(() => import("../features/home/BangladeshScene.jsx"));
const INTRO_DEFAULT = () => Math.round(Math.min(600, Math.max(440, window.innerWidth * 0.4)));
// Space the highlight card takes from the 3D stage, so the map is framed beside it rather than under it.
const RESERVE_WIDE = { left: 300, bottom: 0 };
const RESERVE_NARROW = { left: 0, bottom: 230 };

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const demo = useDemo();
  const manifest = useManifest();
  const unions = useUnions();
  const country = useCountry();
  const evaluation = useEvaluation();
  const [region, setRegion] = useState("sirajganj");
  const [hovered, setHovered] = useState(null);
  const split = useSplit({ storageKey: "rw-split-home", initial: INTRO_DEFAULT, min: 380, max: 760, minRight: 380 });
  const narrow = useMediaQuery("(max-width: 920px)");

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
  const check = evaluation.data?.nisarCheck.find((r) => r.scope === "both");
  const ratio = check && check.major_share_low > 0 ? check.major_share_high / check.major_share_low : null;
  const open = (u) => navigate(`/my-area?region=${region}&union=${u.key}`);

  return (
    <div className={s.home} ref={split.ref} style={split.style}>
      <section className={s.intro}>
        {m && (
          <div className={s.kicker}>
            <Tag tone="forecast">{t("tags.forecastSeason", { season: fmtYear(m.forecastSeason, lang) })}</Tag>
          </div>
        )}
        <h1 className={s.title}>
          <Trans i18nKey="home.title" components={{ hl: <span className="hl" /> }} />
        </h1>
        <p className={s.lede}>
          {t("home.lede", {
            sections: fmtNum(totalSections || 542, lang),
            length: fmtNum(m?.segmentLengthM ?? 500, lang),
          })}
        </p>

        {m && (
          <div className={s.figures}>
            <div className={s.lead}>
              <span className={s.leadFigure}>{fmtNum(highSections, lang)}</span>
              <div>
                <p className={s.leadTitle}>{t("home.figHigh")}</p>
                <p className={s.leadNote}>{t("home.figHighNote", { season: fmtYear(m.forecastSeason, lang) })}</p>
              </div>
            </div>
            <p className={s.secondary}>
              <strong>
                {fmtNum(lastMonsoonHa, lang)} {t("units.ha")}
              </strong>{" "}
              {t("home.figErosion", { year: fmtYear(lastMonsoon, lang) })}
              <span className={s.secondaryNote}> · {t("home.figErosionNote")}</span>
            </p>
          </div>
        )}

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

      <SplitHandle split={split} label={t("layout.resizeIntro")} />

      <section className={s.stage} aria-label={t("home.sceneLabel")}>
        <div className={s.sceneClip}>
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
                reserve={ratio == null ? undefined : narrow ? RESERVE_NARROW : RESERVE_WIDE}
              />
            </Suspense>
          )}
        </div>
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

        {ratio != null && m && (
          <aside className={s.highlight} aria-label={t("home.cardLabel")}>
            <Tag tone="provisional">{t("home.cardLabel")}</Tag>
            <p className={s.highlightFigure}>
              {fmtNum(ratio, lang, 1)}
              <span>×</span>
            </p>
            <p className={s.highlightText}>
              {t("home.cardText", {
                high: fmtPct(check.major_share_high, lang),
                low: fmtPct(check.major_share_low, lang),
                date: fmtDate(m.nisar.latestDate, lang, { day: "numeric", month: "short" }),
              })}
            </p>
            <Link className={s.highlightLink} to="/river-changes?region=sirajganj&tab=nisar">
              {t("home.cardLink")} <ArrowRight size={14} />
            </Link>
          </aside>
        )}
      </section>
    </div>
  );
}
