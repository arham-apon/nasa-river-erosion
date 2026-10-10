import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import MapPageLayout from "../components/layout/MapPageLayout.jsx";
import Button from "../components/ui/Button.jsx";
import { Empty, ErrorState, Loading } from "../components/ui/StateView.jsx";
import MapView from "../features/maps/MapView.jsx";
import GeoLayer from "../features/maps/GeoLayer.jsx";
import MapControls from "../features/maps/MapControls.jsx";
import { FitBounds } from "../features/maps/MapHelpers.jsx";
import { Legend } from "../features/maps/MapOverlays.jsx";
import { useCountry, useRiverInfo } from "../data/queries.js";
import { usePalette } from "../theme/ThemeContext.jsx";
import p from "../features/areas/panel.module.css";

// The two rivers whose stretches River Watch actually measures.
const STUDIED = { Jamuna: "jamuna", Brahmaputra: "brahmaputra" };

function boundsOfLines(lines) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of lines)
    for (const [x, y] of line) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  // A little margin so the river's ends are not on the frame edge.
  const dx = (b[2] - b[0]) * 0.08 + 0.02;
  const dy = (b[3] - b[1]) * 0.08 + 0.02;
  return [[b[0] - dx, b[1] - dy], [b[2] + dx, b[3] + dy]];
}

export default function RiverPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const P = usePalette();
  const info = useRiverInfo();
  const country = useCountry();
  const [basemap, setBasemap] = useState("satellite");
  const [tilt, setTilt] = useState(false);

  const river = info.data ? Object.values(info.data).find((r) => r.id === id) : null;
  const lines = river && country.data?.riverPaths?.[river.name];
  const fc = useMemo(
    () => lines && { type: "FeatureCollection", features: lines.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } })) },
    [lines],
  );
  const bounds = useMemo(() => lines && boundsOfLines(lines), [lines]);

  if (info.isError || country.isError) return <ErrorState error={info.error ?? country.error} onRetry={() => { info.refetch(); country.refetch(); }} />;
  if (!info.data || !country.data) return <Loading />;
  if (!river || !lines) {
    return (
      <Empty title={t("rivers.notFound")}>
        <Button to="/">{t("rivers.backHome")}</Button>
      </Empty>
    );
  }

  const text = (i18n.language === "bn" && river.bn) || river.en;
  const name = t(`rivers.${river.name}`, river.name);
  const studied = STUDIED[river.name];

  const panel = (
    <>
      <div className={p.block}>
        <Button variant="quiet" to="/" className={p.back}>
          <ArrowLeft size={14} /> {t("rivers.backHome")}
        </Button>
        <span className={p.label} style={{ display: "block" }}>
          {t("rivers.kicker")}
        </span>
        <h2 className={p.title} style={{ marginTop: 6 }}>
          {name}
        </h2>
      </div>
      {river.image && (
        <figure style={{ margin: 0 }}>
          <img src={river.image} alt={t("rivers.photoAlt", { river: name })} style={{ display: "block", width: "100%", height: 200, objectFit: "cover" }} />
          {river.imageCredit && (
            <figcaption className={p.headNote} style={{ padding: "6px 24px 0" }}>
              <a href={river.imageCredit} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                {t("rivers.photoCredit")}
              </a>
            </figcaption>
          )}
        </figure>
      )}
      <div className={p.block}>
        <p className={p.body} style={{ fontSize: "var(--fs-ui)", lineHeight: 1.75 }}>
          {text.extract}
        </p>
        <p style={{ marginTop: 12 }}>
          <a href={text.url} target="_blank" rel="noreferrer">
            {t("rivers.readMore")}
          </a>
        </p>
      </div>
      <div className={p.block}>
        <h3 className={p.label} style={{ marginBottom: 8 }}>
          {t("rivers.studyTitle")}
        </h3>
        {studied === "jamuna" ? (
          <>
            <p className={p.body}>{t("rivers.studyJamuna")}</p>
            <div className={p.linkRow} style={{ marginTop: 12 }}>
              <Button to="/my-area?region=gaibandha">
                {t("regions.gaibandha.name")} <ArrowRight size={14} />
              </Button>
              <Button to="/my-area?region=sirajganj">
                {t("regions.sirajganj.name")} <ArrowRight size={14} />
              </Button>
            </div>
          </>
        ) : studied === "brahmaputra" ? (
          <>
            <p className={p.body}>{t("rivers.studyBrahmaputra")}</p>
            <div className={p.linkRow} style={{ marginTop: 12 }}>
              <Button to="/river/jamuna">
                {t("rivers.Jamuna")} <ArrowRight size={14} />
              </Button>
            </div>
          </>
        ) : (
          <p className={p.body}>{t("rivers.contextOnly")}</p>
        )}
      </div>
    </>
  );

  return (
    <MapPageLayout panel={panel} sheetLabel={name}>
      <MapView initialBounds={bounds} basemap={basemap} tilt={tilt} label={t("rivers.mapLabel", { river: name })}>
        <GeoLayer
          id="river-line"
          data={fc}
          layers={[
            { id: "river-casing", type: "line", paint: { "line-color": P.waterStrong, "line-width": 7, "line-opacity": 0.3 }, layout: { "line-cap": "round", "line-join": "round" } },
            { id: "river-main", type: "line", slot: "slot-top", paint: { "line-color": P.water, "line-width": 3 }, layout: { "line-cap": "round", "line-join": "round" } },
          ]}
        />
        <FitBounds bounds={bounds} maxZoom={11} />
        <MapControls basemap={basemap} onBasemap={setBasemap} tilt={tilt} onTilt={setTilt} onReset={() => setTilt(false)} />
        <Legend title={name} items={[{ swatch: "line", color: P.water, label: t("rivers.lineLegend") }]} note={t("rivers.lineNote")} />
      </MapView>
    </MapPageLayout>
  );
}
