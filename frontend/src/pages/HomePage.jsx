import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Trans, useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, ChevronUp, Play } from "lucide-react";
import Segmented from "../components/ui/Segmented.jsx";
import Tag from "../components/ui/Tag.jsx";
import UnionSearch from "../components/ui/UnionSearch.jsx";
import Button from "../components/ui/Button.jsx";
import { ErrorState } from "../components/ui/StateView.jsx";
import { SplitHandle, useSplit } from "../components/layout/Split.jsx";
import { useCountry, useEvaluation, useManifest, useRiverInfo, useUnions } from "../data/queries.js";
import { unionsOfRegion } from "../data/selectors.js";
import { useDemo } from "../features/demo/DemoContext.jsx";
import { fmtDate, fmtNum, fmtPct, fmtYear } from "../lib/format.js";
import { useTheme } from "../theme/ThemeContext.jsx";
import RiverPreview from "../features/home/RiverPreview.jsx";
import s from "./home.module.css";

const BangladeshScene = lazy(() => import("../features/home/BangladeshScene.jsx"));
const INTRO_DEFAULT = () => Math.round(Math.min(600, Math.max(440, window.innerWidth * 0.4)));

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
  const { palette } = useTheme();
  const riverInfo = useRiverInfo();
  const stageRef = useRef(null);
  const [riverTip, setRiverTip] = useState(null);
  const [cardOpen, setCardOpen] = useState(() => {
    try {
      return localStorage.getItem("rw-nisar-card") === "open";
    } catch {
      return false;
    }
  });
  const toggleCard = (open) => {
    setCardOpen(open);
    try {
      localStorage.setItem("rw-nisar-card", open ? "open" : "closed");
    } catch {
      /* not remembered */
    }
  };
  const tipTimer = useRef();
  const showRiver = (name, rect) => {
    clearTimeout(tipTimer.current);
    if (name) {
      const stage = stageRef.current.getBoundingClientRect();
      setRiverTip({ name, x: rect.right - stage.left, left: rect.left - stage.left, y: rect.top - stage.top, w: stage.width, h: stage.height });
    } else {
      // A short grace period lets the pointer travel from the label into the preview.
      tipTimer.current = setTimeout(() => setRiverTip(null), 220);
    }
  };
  const openRiver = (name) => {
    const id = riverInfo.data?.[name]?.id;
    if (id) navigate(`/river/${id}`);
  };

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

      <section className={s.stage} aria-label={t("home.sceneLabel")} ref={stageRef}>
        <div className={s.stageMap}>
        <div className={s.sceneClip}>
          {country.data && (
            <Suspense fallback={null}>
              <BangladeshScene
                data={country.data}
                colors={palette.scene}
                lang={lang}
                selected={region}
                hovered={hovered}
                onHover={setHovered}
                onSelect={setRegion}
                onRiverHover={showRiver}
                onRiverOpen={openRiver}
                regionText={regionText}
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
          {country.data?.elevation && palette.scene.elevation && (
            <li className={s.lgElevation}>
              <span>{t("home.legendElevation")}</span>
              <span className={s.elevRamp}>
                {palette.scene.elevation.map((c) => (
                  <i key={c} style={{ background: `#${c.toString(16).padStart(6, "0")}` }} />
                ))}
              </span>
              <span className={s.elevTicks}>
                {["0", ...country.data.elevation.thresholdsM].map((m, i, all) => (
                  <span key={m}>{i === all.length - 1 ? `>${fmtNum(+m, lang)} ${t("units.m")}` : `${fmtNum(+m, lang)}+`}</span>
                ))}
              </span>
            </li>
          )}
          <li>
            <i className={s.lgCity} /> {t("home.legendCity")}
          </li>
        </ul>
        <p className={s.hint}>{t("home.sceneHint")}</p>
        </div>

        {riverTip && riverInfo.data?.[riverTip.name] && (
          <RiverPreview
            tip={riverTip}
            info={riverInfo.data[riverTip.name]}
            label={t(`rivers.${riverTip.name}`, riverTip.name)}
            onEnter={() => clearTimeout(tipTimer.current)}
            onLeave={() => showRiver(null)}
          />
        )}

        {ratio != null && m && !cardOpen && (
          // Collapsed by default: the result stays visible as a chip without covering the map.
          <button type="button" className={s.highlightChip} aria-expanded="false" onClick={() => toggleCard(true)}>
            <Tag tone="provisional">{t("home.cardLabel")}</Tag>
            <span className={s.chipFigure}>
              {fmtNum(ratio, lang, 1)}
              <span>×</span>
            </span>
            <span className={s.chipText}>{t("home.cardChip")}</span>
            <ChevronUp size={16} aria-hidden="true" />
          </button>
        )}
        {ratio != null && m && cardOpen && (
          <aside className={s.highlight} aria-label={t("home.cardLabel")}>
            <div className={s.highlightHead}>
              <Tag tone="provisional">{t("home.cardLabel")}</Tag>
              <button type="button" className={s.highlightClose} aria-expanded="true" aria-label={t("home.cardCollapse")} onClick={() => toggleCard(false)}>
                <ChevronDown size={16} />
              </button>
            </div>
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
