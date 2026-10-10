import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MapPageLayout from "../components/layout/MapPageLayout.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import UnionSearch from "../components/ui/UnionSearch.jsx";
import { Empty, ErrorState, Loading, QueryGate } from "../components/ui/StateView.jsx";
import MapView from "../features/maps/MapView.jsx";
import GeoLayer from "../features/maps/GeoLayer.jsx";
import MapControls from "../features/maps/MapControls.jsx";
import { FitBounds, HoverSync } from "../features/maps/MapHelpers.jsx";
import { Legend, MapTooltip } from "../features/maps/MapOverlays.jsx";
import { priorityColor, riskColor } from "../theme/palette.js";
import { usePalette } from "../theme/ThemeContext.jsx";
import RegionList from "../features/areas/RegionList.jsx";
import UnionSummary from "../features/areas/UnionSummary.jsx";
import SectionDetail from "../features/areas/SectionDetail.jsx";
import LayerPanel from "../features/areas/LayerPanel.jsx";
import { useAlerts, useManifest, useRegionLayer, useUnions } from "../data/queries.js";
import {
  boundsOf,
  findSection,
  findUnionFeature,
  regionBounds,
  sectionsOfUnion,
  sideLabelKey,
  unionsOfRegion,
} from "../data/selectors.js";
import { useUrlState } from "../lib/urlState.js";
import { fmtNum, fmtYear } from "../lib/format.js";
import p from "../features/areas/panel.module.css";

const DEFAULT_REGION = "sirajganj";
const HOVER = ["boolean", ["feature-state", "hover"], false];
const DEFAULT_LAYERS = {
  priority: true,
  risk: true,
  hindcast: false,
  erosion: false,
  banks: false,
  nisarChange: false,
  nisarCheck: false,
};

export default function MyAreaPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const P = usePalette();
  const [params, update] = useUrlState();
  const manifest = useManifest();
  const m = manifest.data;
  const region = params.get("region") ?? DEFAULT_REGION;
  const regionOk = m ? Boolean(m.regions[region]) : true;
  const mapRegion = regionOk ? region : DEFAULT_REGION;
  const unionKey = params.get("union");
  const sectionId = params.get("section");
  const meta = m?.regions[mapRegion];

  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const hindYears = m?.hindcastYears ?? [];
  const [hindYear, setHindYear] = useState(null);
  const [erosionYear, setErosionYear] = useState(null);
  const hy = hindYear ?? hindYears.at(-1);
  const ey = erosionYear ?? meta?.erosionYears.at(-1);

  const unions = useUnions();
  const forecast = useRegionLayer(mapRegion, "forecast");
  const history = useRegionLayer(sectionId || layers.hindcast ? mapRegion : null, "history");
  const banklines = useRegionLayer(layers.banks ? mapRegion : null, "banklines");
  const erosion = useRegionLayer(layers.erosion ? mapRegion : null, "erosion", layers.erosion ? ey : null);
  const nisarGeo = useRegionLayer(layers.nisarChange ? mapRegion : null, "nisarGeometry");
  const alerts = useAlerts();

  const [basemap, setBasemap] = useState("map");
  const tilt = params.get("view") === "3d";
  const setTilt = (v) => update({ view: v ? "3d" : null }, { replace: true });
  const [hoverUnion, setHoverUnion] = useState(null);
  const [hoverSection, setHoverSection] = useState(null);
  const [unionTip, setUnionTip] = useState(null);
  const [sectionTip, setSectionTip] = useState(null);

  const regionUnions = useMemo(() => unionsOfRegion(unions.data, mapRegion), [unions.data, mapRegion]);
  const regionFC = useMemo(
    () =>
      unions.data && {
        type: "FeatureCollection",
        features: unions.data.features.filter((f) => f.properties.region === mapRegion),
      },
    [unions.data, mapRegion],
  );

  // Past check for one year: the section shapes with that year's hindcast outcome attached.
  const hindcastFC = useMemo(() => {
    if (!forecast.data || !history.data || !layers.hindcast) return null;
    const i = history.data.hindcastYears.indexOf(hy);
    if (i < 0) return null;
    return {
      type: "FeatureCollection",
      features: forecast.data.features.map((f) => ({
        ...f,
        properties: { ...f.properties, outcome: history.data.sections[f.properties.id]?.h[i] ?? null },
      })),
    };
  }, [forecast.data, history.data, layers.hindcast, hy]);

  const unionF = findUnionFeature(unions.data, mapRegion, unionKey);
  const union = unionF?.properties ?? null;
  const sections = useMemo(() => sectionsOfUnion(forecast.data, unionKey), [forecast.data, unionKey]);
  const sectionF = findSection(forecast.data, sectionId);
  const section = sectionF?.properties ?? null;
  const alert = alerts.data?.find((a) => a.region === mapRegion && a.union === unionKey) ?? null;

  const focus = useMemo(() => {
    if (sectionF) return boundsOf(sectionF);
    if (unionF) return boundsOf(unionF);
    return regionBounds(m, mapRegion);
  }, [sectionF, unionF, m, mapRegion]);

  if (manifest.isError) return <ErrorState error={manifest.error} onRetry={manifest.refetch} />;
  if (!m) return <Loading />;

  const selectUnion = (key) => update({ union: key, section: null });
  const regionName = t(`regions.${mapRegion}.name`);
  const sectionTitle = (s) => `${t(sideLabelKey(s.side))} · ${t("section.number", { n: fmtNum(s.segment, lang) })}`;
  const hindOutcome = (id) => {
    const i = history.data?.hindcastYears.indexOf(hy) ?? -1;
    return i >= 0 ? history.data.sections[id]?.h[i] : null;
  };

  // Hiding a fill by opacity, not visibility, keeps it clickable: unions and sections stay selectable.
  const riskOpacity = ["match", ["get", "risk"], "High", 0.86, "Medium", 0.64, 0.36];
  const sectionBase = layers.risk ? riskOpacity : 0;
  const sectionLayers = [
    {
      id: "sections-fill",
      type: "fill",
      slot: "slot-fill",
      interactive: true,
      paint: {
        "fill-color": riskColor(P),
        "fill-opacity": [
          "case",
          HOVER,
          layers.risk ? 0.98 : 0.18,
          unionKey ? ["case", ["==", ["get", "union"], unionKey], sectionBase, layers.risk ? 0.16 : 0] : sectionBase,
        ],
      },
    },
    {
      id: "sections-edge",
      type: "line",
      paint: { "line-color": layers.risk ? P.sectionEdge : P.sectionEdgeFaint, "line-width": 0.6, "line-opacity": layers.risk ? 0.7 : 0.5 },
    },
    {
      id: "sections-sel",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "id"], sectionId ?? ""],
      paint: { "line-color": P.select, "line-width": 2.4 },
    },
  ];
  const unionLayers = [
    // The study area itself: every union in the reach, under the priority tint and the section blocks.
    { id: "unions-base", type: "fill", slot: "slot-fill", paint: { "fill-color": P.studyArea, "fill-opacity": P.studyAreaOpacity } },
    {
      id: "unions-fill",
      type: "fill",
      slot: "slot-fill",
      interactive: true,
      paint: {
        "fill-color": priorityColor(P),
        "fill-opacity": [
          "case",
          HOVER,
          0.22,
          layers.priority ? ["match", ["get", "level"], "High", 0.06, "Medium", 0.035, 0] : 0,
        ],
      },
    },
    {
      id: "unions-line",
      type: "line",
      paint: { "line-color": ["case", HOVER, P.unionHover, P.unionLine], "line-width": ["case", HOVER, 1.4, 0.8] },
    },
    {
      id: "unions-sel",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "key"], unionKey ?? ""],
      paint: { "line-color": P.select, "line-width": 1.6, "line-opacity": 0.9 },
    },
  ];
  // Same encoding for both checks: amber fill = erosion observed, dashed white edge = flagged by the model.
  const checkLayers = (prefix, observed, flagged) => [
    { id: `${prefix}-fill`, type: "fill", slot: "slot-fill", filter: observed, paint: { "fill-color": P.erosion, "fill-opacity": 0.6 } },
    {
      id: `${prefix}-flag`,
      type: "line",
      slot: "slot-top",
      filter: flagged,
      paint: { "line-color": P.flag, "line-width": 1.6, "line-dasharray": [3, 1.5] },
    },
  ];
  const patchLayers = (prefix) => [
    {
      id: `${prefix}-fill`,
      type: "fill",
      slot: "slot-fill",
      paint: { "fill-color": ["match", ["get", "kind"], "settlement", P.settlement, P.erosion], "fill-opacity": 0.85 },
    },
  ];
  const lastBank = meta.bankYears.at(-1);
  const bankLayers = [
    { id: "ma-banks-trail", type: "line", paint: { "line-color": P.water, "line-width": 1, "line-opacity": 0.22 } },
    {
      id: "ma-banks-last",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "year"], lastBank],
      paint: { "line-color": P.water, "line-width": 2.2 },
    },
  ];

  const tipLines = (props) => {
    const lines = [`${t(`risk.${props.risk}`)} · ${props.unionName ?? ""}`];
    if (layers.hindcast && history.data) {
      const o = hindOutcome(props.id);
      if (o) lines.push(t("layers.tipHindcast", { year: fmtYear(hy, lang), outcome: t(`outcome.${o}`) }));
    }
    if (layers.nisarCheck && props.nisarHa != null)
      lines.push(t("layers.tipNisar", { ha: fmtNum(props.nisarHa, lang, 1) }));
    return lines;
  };

  const legendItems = [];
  if (layers.risk)
    legendItems.push(
      { shape: "▲", color: "var(--risk-high)", label: t("legend.high") },
      { shape: "◆", color: "var(--risk-medium)", label: t("legend.medium") },
      { shape: "○", color: "var(--text-2)", label: t("legend.low") },
    );
  if (layers.priority) legendItems.push({ swatch: "fill", color: P.riskHighA(0.3), label: t("layers.items.priority") });
  if (layers.hindcast || layers.nisarCheck) {
    legendItems.push({ swatch: "fill", color: P.erosionA(0.6), label: t("legend.observedMajor", { ha: fmtNum(m.targetHa, lang) }) });
    if (layers.hindcast) legendItems.push({ swatch: "dash", color: P.flag, label: t("legend.flaggedTop20", { year: fmtYear(hy, lang) }) });
    if (layers.nisarCheck) legendItems.push({ swatch: "dash", color: P.flag, label: t("legend.nisarHigh") });
  }
  if (layers.erosion)
    legendItems.push(
      { swatch: "fill", color: P.erosion, label: t("legend.erodedLandYear", { year: fmtYear(ey, lang) }) },
      { swatch: "fill", color: P.settlement, label: t("legend.erodedSettlement") },
    );
  if (layers.nisarChange) legendItems.push({ swatch: "fill", color: P.erosion, label: t("legend.nisarPatch") });
  if (layers.banks)
    legendItems.push(
      { swatch: "line", color: P.water, label: t("legend.bankSelected", { year: fmtYear(lastBank, lang) }) },
      { swatch: "line", color: P.waterA(0.4), label: t("legend.bankTrail") },
    );
  legendItems.push({ swatch: "fill", color: P.studyArea, label: t("legend.studyArea") });
  legendItems.push({ swatch: "outline", color: P.select, label: t("legend.selected") });

  let panel;
  if (!regionOk) {
    panel = (
      <Empty title={t("area.badRegion", { region })}>
        <p>{t("area.badRegionBody")}</p>
      </Empty>
    );
  } else if (section && forecast.data) {
    panel = (
      <SectionDetail
        manifest={m}
        region={mapRegion}
        section={section}
        history={history.data}
        backLabel={union ? union.name : t("area.allUnions", { region: regionName })}
        onBack={() => update({ section: null })}
      />
    );
  } else if (union) {
    panel = (
      <UnionSummary
        manifest={m}
        region={mapRegion}
        union={union}
        sections={sections}
        alert={alert}
        onBack={() => update({ union: null, section: null })}
        onSection={(id) => update({ section: id })}
        hovered={hoverSection}
        onHover={setHoverSection}
      />
    );
  } else {
    panel = (
      <QueryGate queries={[unions]}>
        {unionKey && (
          <div className={p.block} role="alert">
            <strong>{t("area.unionNotFound", { union: unionKey, region: regionName })}</strong>
          </div>
        )}
        {sectionId && forecast.data && !section && (
          <div className={p.block} role="alert">
            <strong>{t("area.sectionNotFound", { id: sectionId })}</strong>
          </div>
        )}
        <RegionList
          region={mapRegion}
          unions={regionUnions}
          onSelect={selectUnion}
          hovered={hoverUnion}
          onHover={setHoverUnion}
        />
      </QueryGate>
    );
  }

  const panelContent = (
    <>
      <div className={`${p.block} ${p.stack}`}>
        <Segmented
          block
          label={t("common.region")}
          value={mapRegion}
          onChange={(r) => update({ region: r, union: null, section: null })}
          options={Object.keys(m.regions).map((r) => ({ value: r, label: t(`regions.${r}.name`) }))}
        />
        <UnionSearch
          unions={regionUnions}
          onSelect={(u) => selectUnion(u.key)}
          placeholder={t("home.searchPlaceholder", { region: regionName })}
        />
      </div>
      <LayerPanel
        layers={layers}
        onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))}
        hindYears={hindYears}
        hindYear={hy}
        onHindYear={setHindYear}
        erosionYears={meta.erosionYears}
        erosionYear={ey}
        onErosionYear={setErosionYear}
      />
      {panel}
    </>
  );

  return (
    <MapPageLayout
      panel={panelContent}
      sheetLabel={section ? sectionTitle(section) : union ? union.name : t("area.details")}
    >
      <MapView
        initialBounds={regionBounds(m, mapRegion)}
        basemap={basemap}
        tilt={tilt}
        label={t("area.mapLabel", { region: regionName })}
      >
        <GeoLayer
          id="unions"
          data={regionFC}
          promoteId="key"
          layers={unionLayers}
          onHover={(f, pt) =>
            setUnionTip(
              f && {
                x: pt.x,
                y: pt.y,
                title: f.properties.name,
                lines: [
                  `${t(`priority.${f.properties.level}`)} · ${t("area.rankShort", {
                    rank: fmtNum(f.properties.rankRegion, lang),
                    total: fmtNum(f.properties.regionCount, lang),
                  })}`,
                ],
              },
            )
          }
          onClick={(f, e) => {
            if (e.target.queryRenderedFeatures(e.point, { layers: ["sections-fill"] }).length) return;
            selectUnion(f.properties.key);
          }}
        />
        <GeoLayer
          id="sections"
          data={forecast.data}
          promoteId="id"
          layers={sectionLayers}
          onHover={(f, pt) => setSectionTip(f && { x: pt.x, y: pt.y, title: sectionTitle(f.properties), lines: tipLines(f.properties) })}
          onClick={(f) => update({ section: f.properties.id, union: f.properties.union ?? unionKey })}
        />
        <GeoLayer
          id="ma-hindcast"
          visible={layers.hindcast}
          data={hindcastFC}
          layers={checkLayers(
            "ma-hind",
            ["in", ["get", "outcome"], ["literal", ["hit", "missed"]]],
            ["in", ["get", "outcome"], ["literal", ["hit", "false_alarm"]]],
          )}
        />
        <GeoLayer
          id="ma-nisarcheck"
          visible={layers.nisarCheck}
          data={layers.nisarCheck ? forecast.data : null}
          layers={checkLayers("ma-ncheck", ["==", ["get", "nisarMajor"], 1], ["==", ["get", "risk"], "High"])}
        />
        <GeoLayer id="ma-erosion" visible={layers.erosion} data={erosion.data} layers={patchLayers("ma-erosion")} />
        <GeoLayer id="ma-nisar" visible={layers.nisarChange} data={nisarGeo.data} layers={patchLayers("ma-nisar")} />
        <GeoLayer id="ma-banks" visible={layers.banks} data={banklines.data} layers={bankLayers} />
        <HoverSync source="unions" id={hoverUnion} />
        <HoverSync source="sections" id={hoverSection} />
        <FitBounds bounds={focus} />
        <MapControls
          basemap={basemap}
          onBasemap={setBasemap}
          tilt={tilt}
          onTilt={setTilt}
          onReset={() => update({ union: null, section: null })}
        />
        <MapTooltip tip={sectionTip ?? unionTip} />
        <Legend title={t("legend.mapKey")} items={legendItems} note={t("legend.sectionNote")} />
      </MapView>
    </MapPageLayout>
  );
}
