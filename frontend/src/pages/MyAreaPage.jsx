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
import { PRIORITY_COLOR, RISK_COLOR } from "../features/maps/mapStyle.js";
import RegionList from "../features/areas/RegionList.jsx";
import UnionSummary from "../features/areas/UnionSummary.jsx";
import SectionDetail from "../features/areas/SectionDetail.jsx";
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

export default function MyAreaPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params, update] = useUrlState();
  const manifest = useManifest();
  const m = manifest.data;
  const region = params.get("region") ?? DEFAULT_REGION;
  const regionOk = m ? Boolean(m.regions[region]) : true;
  const mapRegion = regionOk ? region : DEFAULT_REGION;
  const unionKey = params.get("union");
  const sectionId = params.get("section");

  const unions = useUnions();
  const forecast = useRegionLayer(mapRegion, "forecast");
  const history = useRegionLayer(sectionId ? mapRegion : null, "history");
  const alerts = useAlerts();

  const [basemap, setBasemap] = useState("dark");
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

  const baseOpacity = ["match", ["get", "risk"], "High", 0.86, "Medium", 0.64, 0.36];
  const sectionLayers = [
    {
      id: "sections-fill",
      type: "fill",
      slot: "slot-fill",
      interactive: true,
      paint: {
        "fill-color": RISK_COLOR,
        "fill-opacity": [
          "case",
          HOVER,
          0.98,
          unionKey ? ["case", ["==", ["get", "union"], unionKey], baseOpacity, 0.16] : baseOpacity,
        ],
      },
    },
    { id: "sections-edge", type: "line", paint: { "line-color": "#070a0d", "line-width": 0.6, "line-opacity": 0.7 } },
    {
      id: "sections-sel",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "id"], sectionId ?? ""],
      paint: { "line-color": "#ffffff", "line-width": 2.4 },
    },
  ];
  const unionLayers = [
    {
      id: "unions-fill",
      type: "fill",
      slot: "slot-fill",
      interactive: true,
      paint: {
        "fill-color": PRIORITY_COLOR,
        "fill-opacity": ["case", HOVER, 0.22, ["match", ["get", "level"], "High", 0.1, "Medium", 0.06, 0.02]],
      },
    },
    {
      id: "unions-line",
      type: "line",
      paint: { "line-color": ["case", HOVER, "#a1abb4", "#36434f"], "line-width": ["case", HOVER, 1.4, 0.8] },
    },
    {
      id: "unions-sel",
      type: "line",
      slot: "slot-top",
      filter: ["==", ["get", "key"], unionKey ?? ""],
      paint: { "line-color": "#ffffff", "line-width": 1.6, "line-opacity": 0.9 },
    },
  ];

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
          onHover={(f, pt) =>
            setSectionTip(
              f && {
                x: pt.x,
                y: pt.y,
                title: sectionTitle(f.properties),
                lines: [`${t(`risk.${f.properties.risk}`)} · ${f.properties.unionName ?? ""}`],
              },
            )
          }
          onClick={(f) => update({ section: f.properties.id, union: f.properties.union ?? unionKey })}
        />
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
        <Legend
          title={t("legend.riskTitle", { season: fmtYear(m.forecastSeason, lang) })}
          items={[
            { shape: "▲", color: "var(--risk-high)", label: t("legend.high") },
            { shape: "◆", color: "var(--risk-medium)", label: t("legend.medium") },
            { shape: "○", color: "var(--text-2)", label: t("legend.low") },
            { swatch: "outline", color: "#ffffff", label: t("legend.selected") },
          ]}
          note={t("legend.sectionNote")}
        />
      </MapView>
    </MapPageLayout>
  );
}
