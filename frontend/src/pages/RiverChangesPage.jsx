import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapPageLayout from "../components/layout/MapPageLayout.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import { Empty, ErrorState, Loading } from "../components/ui/StateView.jsx";
import MapView, { useMap } from "../features/maps/MapView.jsx";
import GeoLayer from "../features/maps/GeoLayer.jsx";
import MapControls from "../features/maps/MapControls.jsx";
import { FitBounds } from "../features/maps/MapHelpers.jsx";
import { Legend, MapTooltip } from "../features/maps/MapOverlays.jsx";
import YearTimeline from "../features/history/YearTimeline.jsx";
import BankHistoryPanel from "../features/history/BankHistoryPanel.jsx";
import NisarPanel from "../features/observations/NisarPanel.jsx";
import { useManifest, useRegionLayer, useUnions } from "../data/queries.js";
import { boundsOf, findSection, findUnionFeature, regionBounds, sideLabelKey } from "../data/selectors.js";
import { usePalette } from "../theme/ThemeContext.jsx";
import { intParam, prefersReducedMotion, useUrlState } from "../lib/urlState.js";
import { fmtNum, fmtYear } from "../lib/format.js";
import p from "../features/areas/panel.module.css";

const DEFAULT_REGION = "sirajganj";
const HOVER = ["boolean", ["feature-state", "hover"], false];
const STACK_STEP_M = 950;
const STACK_THICK_M = 320;
const STEP_MS = 1300;

/** Fades a layer in whenever `value` changes, so a year step reads as a change rather than a jump. */
function FadeIn({ layers, value }) {
  const map = useMap();
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const ids = layers.filter(([id]) => map.getLayer(id));
    for (const [id, prop] of ids) {
      map.setPaintProperty(id, `${prop}-transition`, { duration: 0, delay: 0 });
      map.setPaintProperty(id, prop, 0);
    }
    const raf = requestAnimationFrame(() => {
      for (const [id, prop, to] of ids) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, `${prop}-transition`, { duration: 450, delay: 0 });
        map.setPaintProperty(id, prop, to);
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value]);
  return null;
}

export default function RiverChangesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const P = usePalette();
  const [params, update] = useUrlState();
  const manifest = useManifest();
  const m = manifest.data;
  const region = params.get("region") ?? DEFAULT_REGION;
  const regionOk = m ? Boolean(m.regions[region]) : true;
  const r = regionOk ? region : DEFAULT_REGION;
  const meta = m?.regions[r];
  const tab = params.get("tab") === "nisar" ? "nisar" : "banks";
  const years = meta?.bankYears ?? [];
  const bankParam = intParam(params, "bank");
  const bank = years.includes(bankParam) ? bankParam : years.at(-1);
  const compareParam = params.get("compare");
  const compare =
    compareParam === "none" ? null : years.includes(Number(compareParam)) && Number(compareParam) !== bank ? Number(compareParam) : years[0] !== bank ? years[0] : null;
  const sectionId = params.get("section");
  const unionKey = params.get("union");
  const monsoon = bank - 1;
  const hasErosion = meta?.erosionYears.includes(monsoon);

  const forecast = useRegionLayer(m ? r : null, "forecast");
  const history = useRegionLayer(m ? r : null, "history");
  const banklines = useRegionLayer(m ? r : null, "banklines");
  const tilt = params.get("view") === "3d";
  const setTilt = (v) => update({ view: v ? "3d" : null }, { replace: true });
  const banklines3d = useRegionLayer(m && tilt && tab === "banks" ? r : null, "banklines3d");
  const erosion = useRegionLayer(m && tab === "banks" && hasErosion ? r : null, "erosion", hasErosion ? monsoon : null);
  const nisar = useRegionLayer(m && tab === "nisar" ? r : null, "nisar");
  const nisarGeo = useRegionLayer(m && tab === "nisar" ? r : null, "nisarGeometry");
  const unions = useUnions();

  const [basemap, setBasemap] = useState("satellite");
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState(null);
  const [nisarLayers, setNisarLayers] = useState({ patches: true, check: true });
  const autoplayed = useRef(false);

  // Demo step 2 asks for playback once; the parameter is consumed so Back/reload never restarts it.
  useEffect(() => {
    if (autoplayed.current || params.get("play") !== "1") return;
    autoplayed.current = true;
    update({ play: null }, { replace: true });
    if (!prefersReducedMotion()) setPlaying(true);
  }, [params, update]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setTimeout(() => {
      const i = years.indexOf(bank);
      if (i >= years.length - 1) setPlaying(false);
      else update({ bank: years[i + 1] }, { replace: true });
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [playing, bank, years, update]);

  useEffect(() => setPlaying(false), [tab, r]);

  const section = findSection(forecast.data, sectionId)?.properties ?? null;
  const unionF = findUnionFeature(unions.data, r, unionKey);
  const focus = useMemo(() => {
    if (unionF) return boundsOf(unionF);
    return regionBounds(m, r);
  }, [unionF, m, r]);

  const monsoonHa = useMemo(
    () => Object.fromEntries((meta?.erosionByMonsoon ?? []).map((e) => [e.monsoon, e.totalMappedHa])),
    [meta],
  );

  if (manifest.isError) return <ErrorState error={manifest.error} onRetry={manifest.refetch} />;
  if (!m) return <Loading />;

  const stop = () => setPlaying(false);
  const setYear = (y) => {
    stop();
    update({ bank: y });
  };
  const y0 = years[0];
  const y1 = years.at(-1);
  const sectionTitle = (s) => `${t(sideLabelKey(s.side))} · ${t("section.number", { n: fmtNum(s.segment, lang) })}`;

  const sectionLayers = [
    {
      id: "rc-sections-fill",
      type: "fill",
      slot: "slot-fill",
      interactive: true,
      paint: { "fill-color": P.select, "fill-opacity": ["case", HOVER, 0.12, 0.0] },
    },
    {
      id: "rc-sections-line",
      type: "line",
      paint: {
        "line-color": ["case", HOVER, P.compare, P.sectionLine],
        "line-width": ["case", HOVER, 1.2, 0.5],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.12, 12, 0.6],
      },
    },
    {
      id: "rc-sections-sel",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "id"], sectionId ?? ""],
      paint: { "line-color": P.select, "line-width": 2.2 },
    },
  ];
  if (tab === "nisar" && nisarLayers.check) {
    sectionLayers.splice(
      1,
      0,
      {
        id: "rc-check-major",
        type: "fill",
        slot: "slot-fill",
        filter: ["==", ["get", "nisarMajor"], 1],
        paint: { "fill-color": P.erosion, "fill-opacity": 0.4 },
      },
      {
        id: "rc-check-high",
        type: "line",
        slot: "slot-top",
        filter: ["==", ["get", "risk"], "High"],
        paint: { "line-color": P.flag, "line-width": 1.6, "line-dasharray": [3, 1.5] },
      },
    );
  }

  const bankLayers = [
    {
      id: "banks-trail",
      type: "line",
      paint: { "line-color": P.water, "line-width": 1, "line-opacity": tab === "banks" ? 0.14 : 0 },
    },
    {
      id: "banks-compare",
      type: "line",
      filter: ["==", ["get", "year"], tab === "banks" ? (compare ?? -1) : -1],
      paint: { "line-color": P.compare, "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.85 },
    },
    {
      id: "banks-current",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "year"], tab === "banks" ? bank : y1],
      paint: { "line-color": P.water, "line-width": tab === "banks" ? 2.6 : 1.4, "line-opacity": 1 },
    },
  ];

  const erosionLayers = [
    {
      id: "erosion-fill",
      type: "fill",
      slot: "slot-fill",
      paint: {
        "fill-color": ["match", ["get", "kind"], "settlement", P.settlement, P.erosion],
        "fill-opacity": 0.8,
      },
    },
    {
      id: "erosion-settlement",
      type: "line",
      filter: ["==", ["get", "kind"], "settlement"],
      paint: { "line-color": P.settlementEdge, "line-width": 0.8 },
    },
  ];

  const stackLayers = [
    {
      id: "banks-stack",
      type: "fill-extrusion",
      slot: "slot-top",
      paint: {
        "fill-extrusion-color": [
          "case",
          ["==", ["get", "year"], bank],
          P.select,
          ["interpolate", ["linear"], ["get", "year"], y0, P.stackFrom, y1, P.stackTo],
        ],
        "fill-extrusion-base": ["*", ["-", ["get", "year"], y0], STACK_STEP_M],
        "fill-extrusion-height": ["+", ["*", ["-", ["get", "year"], y0], STACK_STEP_M], STACK_THICK_M],
        "fill-extrusion-opacity": 0.92,
      },
    },
  ];

  const nisarPatchLayers = [
    {
      id: "nisar-fill",
      type: "fill",
      slot: "slot-fill",
      paint: {
        "fill-color": ["match", ["get", "kind"], "settlement", P.settlement, P.erosion],
        "fill-opacity": nisarLayers.patches ? 0.85 : 0,
      },
    },
  ];

  const panel = !regionOk ? (
    <Empty title={t("area.badRegion", { region })}>
      <p>{t("area.badRegionBody")}</p>
    </Empty>
  ) : tab === "banks" ? (
    <BankHistoryPanel
      manifest={m}
      region={r}
      bank={bank}
      compare={compare}
      history={history}
      section={section}
      tilt={tilt}
      onYear={setYear}
      onClearSection={() => update({ section: null })}
    />
  ) : (
    <NisarPanel manifest={m} region={r} nisar={nisar} forecast={forecast} layers={nisarLayers} onLayers={setNisarLayers} />
  );

  const legend =
    tab === "banks"
      ? {
          title: t("legend.banksTitle"),
          items: tilt
            ? [
                { swatch: "ramp", color: `linear-gradient(90deg,${P.stackFrom},${P.stackTo})`, label: t("legend.stackRamp", { from: fmtYear(y0, lang), to: fmtYear(y1, lang) }) },
                { swatch: "fill", color: P.select, label: t("legend.stackSelected", { year: fmtYear(bank, lang) }) },
                { swatch: "fill", color: P.erosion, label: t("legend.erodedLand") },
              ]
            : [
                { swatch: "line", color: P.water, label: t("legend.bankSelected", { year: fmtYear(bank, lang) }) },
                ...(compare ? [{ swatch: "dash", color: P.compare, label: t("legend.bankCompare", { year: fmtYear(compare, lang) }) }] : []),
                { swatch: "line", color: P.waterA(0.35), label: t("legend.bankTrail") },
                { swatch: "fill", color: P.erosion, label: t("legend.erodedLand") },
                { swatch: "fill", color: P.settlement, label: t("legend.erodedSettlement") },
              ],
          note: tilt ? t("legend.stackNote") : t("legend.erosionNote", { min: fmtNum(m.display.erosionMinHa, lang) }),
        }
      : {
          title: t("legend.nisarTitle"),
          items: [
            { swatch: "fill", color: P.erosion, label: t("legend.nisarPatch") },
            { swatch: "fill", color: P.erosionA(0.45), label: t("legend.nisarMajor", { ha: fmtNum(m.targetHa, lang) }) },
            { swatch: "dash", color: P.flag, label: t("legend.nisarHigh") },
            { swatch: "line", color: P.water, label: t("legend.bankSelected", { year: fmtYear(y1, lang) }) },
          ],
          note: t("legend.nisarNote"),
        };

  const panelContent = (
    <>
      <div className={`${p.block} ${p.stack}`}>
        <Segmented
          block
          label={t("common.region")}
          value={r}
          onChange={(v) => update({ region: v, section: null, union: null })}
          options={Object.keys(m.regions).map((id) => ({ value: id, label: t(`regions.${id}.name`) }))}
        />
        <Segmented
          block
          label={t("river.tabs")}
          value={tab}
          onChange={(v) => update({ tab: v })}
          options={[
            { value: "banks", label: t("river.tabBanks") },
            { value: "nisar", label: t("river.tabNisar") },
          ]}
        />
      </div>
      {panel}
    </>
  );

  return (
    <MapPageLayout panel={panelContent} sheetLabel={tab === "banks" ? t("river.banklineTitle", { year: fmtYear(bank, lang) }) : t("river.tabNisar")}>
      <MapView
        initialBounds={regionBounds(m, r)}
        basemap={basemap}
        tilt={tilt}
        tiltPitch={tab === "banks" ? 62 : 50}
        label={t("river.mapLabel", { region: t(`regions.${r}.name`) })}
      >
        <GeoLayer
          id="rc-sections"
          key={`sections-${tab}-${nisarLayers.check}`}
          data={forecast.data}
          promoteId="id"
          layers={sectionLayers}
          onHover={(f, pt) =>
            setTip(f && { x: pt.x, y: pt.y, title: sectionTitle(f.properties), lines: [f.properties.unionName ?? ""] })
          }
          onClick={(f) => {
            stop();
            update({ section: f.properties.id });
          }}
        />
        {tab === "banks" && <GeoLayer id="erosion" data={erosion.data} layers={erosionLayers} />}
        {tab === "nisar" && <GeoLayer id="nisar" data={nisarGeo.data} layers={nisarPatchLayers} />}
        <GeoLayer id="banks" data={banklines.data} layers={bankLayers} />
        {tilt && tab === "banks" && <GeoLayer id="banks3d" data={banklines3d.data} layers={stackLayers} />}
        {unionF && (
          <GeoLayer
            id="rc-union"
            data={unionF}
            layers={[{ id: "rc-union-line", type: "line", slot: "slot-top", paint: { "line-color": P.select, "line-width": 1.4, "line-dasharray": [1, 1.5] } }]}
          />
        )}
        <FadeIn layers={[["banks-current", "line-opacity", 1], ["erosion-fill", "fill-opacity", 0.8]]} value={`${bank}-${erosion.isPlaceholderData}`} />
        <FitBounds bounds={focus} maxZoom={12.5} />
        <MapControls basemap={basemap} onBasemap={setBasemap} tilt={tilt} onTilt={setTilt} onReset={() => update({ union: null })} tiltLabel={tab === "banks" ? t("river.stack3d") : "3D"} />
        <MapTooltip tip={tip} />
        <Legend {...legend} position="top" />
        {tab === "banks" && (
          <YearTimeline
            years={years}
            value={bank}
            compare={compare}
            onChange={setYear}
            onCompare={(y) => {
              stop();
              update({ compare: y ?? "none" });
            }}
            playing={playing}
            onTogglePlay={() => {
              if (!playing && bank === years.at(-1)) update({ bank: years[0] }, { replace: true });
              setPlaying((v) => !v);
            }}
            monsoonHa={monsoonHa}
          />
        )}
      </MapView>
    </MapPageLayout>
  );
}
