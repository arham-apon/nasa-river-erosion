# Char Erosion Watch: Frontend Guide

**Stack: React (JavaScript, `.jsx` files only, no TypeScript), built with Vite.**

This guide describes how to build the public frontend for Char Erosion Watch: an interactive, map-first web app that lets anyone scrub through 12 years of satellite images, watch the Jamuna eat its banks, see where it will strike next, and find out what that means for each union. It is a plan, not code: every step says what to build, which library to use, which data file feeds it, and what "done" looks like.

The current `data/web/dashboard.html` (Leaflet, one file) stays as the quick demo. The new app lives in a separate `frontend/` folder and reads the same outputs.

---

## Contents

0. [Overview: what the user experiences](#0-overview-what-the-user-experiences)
1. [Step 1: Tech stack and project setup](#step-1-tech-stack-and-project-setup)
2. [Step 2: Prepare the data for the web](#step-2-prepare-the-data-for-the-web)
3. [Step 3: Design system (colours, type, motion)](#step-3-design-system-colours-type-motion)
4. [Step 4: App shell, routing and global state](#step-4-app-shell-routing-and-global-state)
5. [Step 5: The map core](#step-5-the-map-core)
6. [Step 6: Time slider and satellite time-lapse](#step-6-time-slider-and-satellite-time-lapse)
7. [Step 7: Before/after swipe and side-by-side compare](#step-7-beforeafter-swipe-and-side-by-side-compare)
8. [Step 8: Area details bar (hover strip)](#step-8-area-details-bar-hover-strip)
9. [Step 9: Details drawer for unions and bank stretches](#step-9-details-drawer-for-unions-and-bank-stretches)
10. [Step 10: Forecast, hindcast and 3D risk views](#step-10-forecast-hindcast-and-3d-risk-views)
11. [Step 11: Union ranking, search and "my location"](#step-11-union-ranking-search-and-my-location)
12. [Step 12: Insights page (charts that tell the story)](#step-12-insights-page-charts-that-tell-the-story)
13. [Step 13: Alert centre (Bangla text, audio, SMS preview)](#step-13-alert-centre-bangla-text-audio-sms-preview)
14. [Step 14: "How it works" interactive explainer](#step-14-how-it-works-interactive-explainer)
15. [Step 15: Story mode and guided tour for judges](#step-15-story-mode-and-guided-tour-for-judges)
16. [Step 16: Map tools (measure, draw, share, export)](#step-16-map-tools-measure-draw-share-export)
17. [Step 17: Bangla / English, accessibility, mobile](#step-17-bangla--english-accessibility-mobile)
18. [Step 18: Performance](#step-18-performance)
19. [Step 19: Testing](#step-19-testing)
20. [Step 20: Build and deploy](#step-20-build-and-deploy)
21. [Appendix: priorities if time is short](#appendix-priorities-if-time-is-short)

---

## 0. Overview: what the user experiences

**Pages**

| Route | Page | Purpose |
|---|---|---|
| `/` | Home (story intro) | Animated hero: "The Jamuna took X hectares of farmland since 2015." Scroll-driven story, then a big "Explore the map" button |
| `/map` | Explorer (the main screen) | Full-screen map, time slider, layers, hover strip, details drawer |
| `/unions` | Union ranking | Sortable, searchable table of all 82 unions with mini-charts |
| `/insights` | Insights | Charts: erosion per year, bank vs char erosion, model vs baselines, what drives erosion |
| `/alerts` | Alert centre | Bangla alerts per High union, audio, phone-style SMS preview |
| `/how-it-works` | Method | Interactive explainer of radar, threshold, erosion detection, model |
| `/about` | About | Team, data sources, licences, limitations |

**The main screen at a glance**

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Logo  Char Erosion Watch     Map  Unions  Insights  Alerts  How it works  [বাংলা] [◐] │
├──────────────┬───────────────────────────────────────────────────┬────────────┤
│ Layers       │                                                   │ Details    │
│ ○ Satellite  │                  MAP (MapLibre)                    │ drawer     │
│ ○ Radar      │      ── banklines, erosion, risk stretches ──      │ (opens on  │
│ ○ Classified │                                                   │  click)    │
│ ☑ Banklines  │                  [ swipe handle ]                  │            │
│ ☑ Erosion    │                                                   │  gauge     │
│ ☑ Risk 2026  │                                                   │  charts    │
│ Region ▾     │                                                   │  Bangla    │
├──────────────┴───────────────────────────────────────────────────┴────────────┤
│ ◀ ▶ ⏯  2015 ─────●─────────────────────────────────── 2026   speed 1×  compare │
├───────────────────────────────────────────────────────────────────────────────┤
│ Hover strip: Kaijuri · Sirajganj · score 0.75 High · 22,854 people · ▁▃▅▂▇ lost ha │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Tech stack and project setup

### Libraries (all free, all JavaScript)

| Need | Library | Why |
|---|---|---|
| Build tool | **Vite** (React template, JavaScript) | Fast dev server, simple config, static build |
| UI | **React** with `.jsx` components | Required stack |
| Map | **MapLibre GL JS** via **react-map-gl** (`react-map-gl/maplibre`) | WebGL, smooth zoom, raster + vector layers, 3D extrusions, free (no token) |
| Heavy map layers (optional) | **deck.gl** (`@deck.gl/react`, `@deck.gl/layers`) | Animated paths, 3D columns, many polygons at 60 fps |
| Swipe compare | **@maplibre/maplibre-gl-compare** or two synced maps | Before/after slider |
| Charts | **Recharts** (simple) and/or **visx** (custom) | Sparklines, bars, area charts, gauges |
| Animation | **Framer Motion** | Drawer slide, number count-up, page transitions |
| State | **Zustand** | Tiny global store (year, layers, selection) |
| Data loading | **TanStack Query** | Caching, loading states for JSON/GeoJSON |
| Routing | **React Router** | Pages above, shareable URLs |
| Styling | **Tailwind CSS** + CSS variables | Fast, consistent design tokens, dark mode |
| UI primitives | **Radix UI** (slider, dialog, tabs, tooltip, toggle) | Accessible, unstyled, keyboard-ready |
| Icons | **lucide-react** | Clean line icons |
| Geo maths | **@turf/turf** | Distance to bank, area of drawn polygons |
| Translation | **react-i18next** | English / Bangla |
| Tour | **react-joyride** | Guided tour for judges |
| Tables | **TanStack Table** | Sort, filter, search for the union list |
| Big vector data | **PMTiles** (`pmtiles` protocol for MapLibre) | Erosion polygons for all years without loading 30 MB GeoJSON |
| Tests | **Vitest**, **React Testing Library**, **Playwright** | Unit, component, end-to-end |

### Setup

```
npm create vite@latest frontend -- --template react
cd frontend
npm install react-map-gl maplibre-gl @maplibre/maplibre-gl-compare pmtiles
npm install zustand @tanstack/react-query @tanstack/react-table react-router-dom
npm install recharts framer-motion @radix-ui/react-slider @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip lucide-react
npm install @turf/turf react-i18next i18next react-joyride
npm install -D tailwindcss @tailwindcss/vite vitest @testing-library/react @playwright/test
```

### Folder layout

```
frontend/
  public/
    data/                 <- copied from ../data/web + new files from Step 2
      unions.geojson  segments_forecast.geojson  segments_hindcast.geojson
      banklines.geojson  erosion.pmtiles  timeseries/  imagery/  summary.json
    audio/alert_1.mp3
  src/
    main.jsx  App.jsx  i18n.js  store.js  theme.css
    pages/        Home.jsx  Explorer.jsx  Unions.jsx  Insights.jsx  Alerts.jsx  HowItWorks.jsx  About.jsx
    map/          MapView.jsx  layers/*.jsx  CompareView.jsx  MapControls.jsx  Legend.jsx
    timeline/     TimeSlider.jsx  PlayButton.jsx  YearTicks.jsx
    panels/       HoverStrip.jsx  DetailsDrawer.jsx  UnionCard.jsx  StretchCard.jsx  LayerPanel.jsx
    charts/       Sparkline.jsx  ErosionBars.jsx  RetreatProfile.jsx  ScoreGauge.jsx  ModelCompare.jsx
    components/   Button.jsx  Pill.jsx  StatCard.jsx  CountUp.jsx  Skeleton.jsx
    hooks/        useData.js  useUrlState.js  useKeyboard.js
    utils/        colors.js  format.js  geo.js
```

---

## Step 2: Prepare the data for the web

The Python pipeline already writes `data/web/`. The frontend needs a few more files. Make them with one new script, e.g. `08_export_frontend.py` (to be written later; nothing in the existing pipeline changes).

### 2.1 What already exists (`data/web/`)

| File | Features | Properties | Used for |
|---|---|---|---|
| `unions.geojson` | 82 | `union_id, region, union_name, threat_score, threat_level, rank, max_score, mean_score, stretches, high_stretches, population, buildings` | Union layer, ranking, cards |
| `segments_forecast.geojson` | 542 | `segment, side, region, year, prob, risk_class, segment_score, union_name, population, buildings` | 2026 risk per 500 m stretch |
| `segments_hindcast.geojson` | 1,626 | `segment, side, region, year, prob, target, target_eroded_ha, outcome` | 2023–2025 hit / miss / false alarm |
| `banklines.geojson` | 24 | `dry_season, side, region` | Bank lines (every 2nd year) |
| `erosion.geojson` | 2,516 | `monsoon, kind, area_ha, region` | Erosion patches 2021–2025, ≥ 3 ha |
| `results_time_split.json`, `results_cross_region.json` | – | `model, pr_auc, recall_top20, precision_top20, positives, rows` | Model vs baselines charts |
| `feature_importance.json` | – | `"Unnamed: 0"` (feature name), `importance` | "What drives erosion" (rename the key to `feature` on export) |
| `alerts_bn.json` | 13 | `union, region, text` | Alert centre |
| `alert_1.mp3` | – | – | Voice alert |

### 2.2 New files to export

| New file | Made from | Content | Why |
|---|---|---|---|
| `imagery/<region>/s2_<year>.webp` (+ `.json` with corner coordinates) | Earth Engine: Sentinel-2 true-colour dry-season median (Nov–Apr). 2017+ from `COPERNICUS/S2_SR_HARMONIZED`; 2016 from `COPERNICUS/S2_HARMONIZED`; 2015 from Landsat 8 | One real-colour image per dry season per region | **The time-lapse slider** (Step 6) |
| `imagery/<region>/s1_<year>.webp` | Sentinel-1 ascending VV/VH composite, the same images the analysis used | Radar false-colour per year (all 12 years, cloud-free) | "Radar view" toggle: shows what the model really saw |
| `imagery/<region>/class_<year>.webp` | `class_YYYY.tif` coloured (blue sand/water, green land, red settlement, transparent no data) | Classified map per year | "Classified view" toggle |
| `banklines_all.geojson` | `banklines.gpkg` (all 12 years) | Every year, simplified | Bank line that moves with the slider |
| `erosion.pmtiles` | `erosion_polygons.gpkg`, all monsoons 2015–2025, all sizes ≥ 1 ha | Vector tiles | Erosion of the selected monsoon, fast at every zoom |
| `timeseries/segments.json` | `training_table.csv` (both regions) | Per stretch: `eroded_ha[]`, `retreat_m[]`, `bank_x[]`, `width_m[]` for 2015–2025 | Sparklines and charts in the drawer |
| `timeseries/unions.json` | Same, grouped by `union_id` | Per union: eroded ha per year, settlement lost per year | Union card charts, ranking mini-charts |
| `summary.json` | All outputs | Totals per region per year (box vs bank erosion), headline numbers | Home page counters, Insights |
| `explain/segments_2026.json` (optional) | `model_final.joblib` + SHAP values | Top 3 reasons per stretch | "Why is this stretch high risk?" |

**Important: image alignment.** The rasters are in UTM 45N (EPSG:32645). MapLibre places images by their four corners in longitude/latitude and draws them in Web Mercator. Re-project every image to EPSG:3857 before export (e.g. `rasterio.warp.reproject`), then store its four corner coordinates. Otherwise images drift by tens of metres against the bank lines.

**Sizes.** One WebP per region per year at 20 m is about 0.5–2 MB. 12 years × 2 regions × 3 views ≈ 70 images ≈ 60–100 MB total. For hosting, convert to tiles (`gdal2tiles.py` → PMTiles, zoom 8–14) so phones download only what is on screen.

**Optional extra time-lapse source (no export needed):** Esri World Imagery Wayback (archived versions of the satellite basemap since 2014, served as tiles with a release number). Good as a high-resolution "real photo" layer at village zoom. Check the terms of use and attribution before public use.

---

## Step 3: Design system (colours, type, motion)

### Look and feel

A calm, editorial, data-journalism look (think BBC/Reuters visual stories): dark map, soft glass panels, one strong accent colour for danger.

### Colour tokens (CSS variables, light and dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f7f4` | `#0e1116` | Page background |
| `--panel` | `rgba(255,255,255,.85)` | `rgba(22,26,33,.80)` | Glass panels (with `backdrop-filter: blur(12px)`) |
| `--text` | `#1b1f24` | `#e8eaed` | Main text |
| `--muted` | `#5f6b7a` | `#9aa4b2` | Labels |
| `--river` | `#2b7bb9` | `#5aa9e6` | Water, links, focus |
| `--sand` | `#d8c39a` | `#c9b07c` | Sandbars, chars |
| `--land` | `#5a9e4b` | `#76b866` | Vegetated land |
| `--settle` | `#d64545` | `#ff6b6b` | Settlements |

**Risk palette (colour-blind safe, ordered):**

| Level | Colour | Also shown by |
|---|---|---|
| High | `#b2182b` | Bold outline + "▲" icon |
| Medium | `#ef8a62` | Medium outline |
| Low | `#67a9cf` | Thin outline |

**Hindcast palette:** hit `#1a9850`, missed `#d73027`, false alarm `#fdae61`, correct quiet `#d9d9d9`. Never rely on colour alone; every legend item also has a shape or pattern.

**Year gradient** (2015 → 2026) for bank lines and timeline: sequential `viridis`-like ramp from deep purple to yellow, so older banks fade and the newest bank glows.

### Typography

- English: **Inter** (UI), **Fraunces** or **Source Serif** for big story headlines.
- Bangla: **Hind Siliguri** or **Noto Sans Bengali** (Google Fonts), loaded only when Bangla is on.
- Numbers: `font-variant-numeric: tabular-nums` so counters do not jump.

### Motion rules (Framer Motion)

- Drawers slide in 250 ms with spring easing; panels fade 150 ms.
- Map `flyTo` 1.2–1.8 s with easing; never animate when the user has `prefers-reduced-motion`.
- Counters count up once, when they scroll into view.
- Eroded patches of the selected monsoon "pulse" once (outline glow) when the year changes.

---

## Step 4: App shell, routing and global state

### Global store (`store.js`, Zustand)

```jsx
import { create } from "zustand";

export const useApp = create((set) => ({
  year: 2025,                 // dry season shown on the map
  playing: false,
  speed: 1,
  region: "all",              // "all" | "gaibandha" | "sirajganj"
  view: "satellite",          // "satellite" | "radar" | "classified"
  layers: { banklines: true, erosion: true, risk: true, unions: true, hindcast: false, trail: false },
  compare: { on: false, left: 2016, right: 2025, mode: "swipe" },
  hover: null,                // feature under the cursor (for the strip)
  selected: null,             // { type: "union" | "stretch", id }
  lang: "en",
  theme: "dark",
  set: (patch) => set(patch),
}));
```

### URL state (`useUrlState.js`)

Mirror `year`, `view`, `region`, `layers`, `selected` and the map centre/zoom into the query string, e.g. `/map?y=2020&v=radar&u=BD...&z=11.2&c=89.66,24.52`. Any view can be shared as a link and survives reload.

### Shell (`App.jsx`)

- Top bar: logo, nav links, language toggle, theme toggle, "Tour" button.
- `<Outlet/>` for pages, with Framer Motion `AnimatePresence` page transitions.
- One `QueryClientProvider` and one `I18nextProvider` at the root.

---

## Step 5: The map core

### `MapView.jsx`

- `react-map-gl/maplibre` `<Map>` with `mapStyle` built in code: a dark vector basemap (e.g. OpenFreeMap or a MapTiler free style) plus the Esri World Imagery raster as an optional base.
- Initial view: fit both regions (`[89.51, 23.98]` to `[89.95, 25.42]`). Region dropdown flies to one region.
- `maxBounds` a little larger than the study area so users cannot get lost.
- `interactiveLayerIds` for unions, stretches, erosion → hover and click events.

### Layers (one small component each in `map/layers/`)

| Layer | Source | Style | Interaction |
|---|---|---|---|
| `ImageryLayer` | `imagery/<region>/<view>_<year>.webp` (image source) | Raster, opacity slider | Cross-fades when the year changes |
| `UnionsLayer` | `unions.geojson` | Fill by `threat_level`, 25% opacity; outline; label with union name at zoom ≥ 10 | Hover highlight, click → union drawer |
| `RiskStretchLayer` | `segments_forecast.geojson` | Fill by `risk_class`; optional 3D extrusion (Step 10) | Hover, click → stretch drawer |
| `BanklineLayer` | `banklines_all.geojson` filtered by `dry_season == year` | West red-ish, east green-ish, 2.5 px, glow | Click → year label |
| `BankTrailLayer` | Same, all years ≤ selected year | Thin lines coloured by year gradient | Shows the bank "walking" over time |
| `ErosionLayer` | `erosion.pmtiles` filtered by `monsoon == year` | Bright yellow fill (land), magenta (settlement), pulse on change | Click → area in ha |
| `HindcastLayer` | `segments_hindcast.geojson` filtered by year | Hindcast palette | Click → outcome + model score |
| `LabelsLayer` | Basemap places + union names | Halo text | – |

**Hover:** use MapLibre `feature-state` (`hover: true`) for instant highlight without re-rendering React.

**Legend (`Legend.jsx`):** auto-built from the visible layers, collapsible, with small swatches and shapes; shows the selected year.

---

## Step 6: Time slider and satellite time-lapse

The heart of the app: drag through 2015–2026 and watch the river move.

### `TimeSlider.jsx`

- Radix `Slider` with 12 stops (dry seasons 2015–2026), snapping to whole years.
- Above the track: a **mini bar chart** of hectares eroded per monsoon (from `summary.json`), so users see big years (2015, 2020) before they even drag.
- Below the track: year labels; the selected year shows the season in words ("Dry season Nov 2019 – Apr 2020").
- Buttons: ◀ previous, ▶ next, ⏯ play/pause, speed 0.5× / 1× / 2×, loop toggle.
- Keyboard: ← / → change year, Space play/pause, `C` toggles compare.

### Playback

```jsx
useEffect(() => {
  if (!playing) return;
  const id = setInterval(() => {
    set((s) => ({ year: s.year >= 2026 ? 2015 : s.year + 1 }));
  }, 1400 / speed);
  return () => clearInterval(id);
}, [playing, speed]);
```

### Smooth image changes

- Keep **two** raster layers (A and B). When the year changes, load the next image into the hidden layer, wait for `idle`, then animate its `raster-opacity` from 0 to 1 over 400 ms while the other fades out. No flicker.
- **Preload** the next and previous year's images (create `Image()` objects) so playback is smooth.

### View toggle: Satellite / Radar / Classified

Segmented control above the slider:

- **Satellite**: Sentinel-2 true colour (what a person would see).
- **Radar**: Sentinel-1 composite (what the system sees through clouds); a small badge "cloud-free, day and night".
- **Classified**: blue sand/water, green land, red settlement (what the algorithm decided).

### Erosion overlay synced to the slider

- At year `Y` the map shows the image of dry season `Y` and, if "Erosion" is on, the land **lost in monsoon `Y`** (between `Y` and `Y+1`), so users see the land that is about to disappear.
- Toggle "show what was lost" vs "show what will be lost next" for teaching.
- Running total in the corner: "Land lost since 2015 in view: 12,430 ha" (sum of patches inside the current map bounds, computed with Turf on visible features).

### Bank trail ("ghost banks")

Toggle "trail": draws every earlier bank line in the year gradient, so a single image shows how far the bank walked. Hover a ghost line → "Bank in 2017: 1.2 km east of today's bank here".

---

## Step 7: Before/after swipe and side-by-side compare

### Modes (button "Compare" next to the slider)

| Mode | How it works |
|---|---|
| **Swipe** | One map, a vertical handle; left of the handle shows year A, right shows year B. Drag the handle across a bend to "wipe away" the land |
| **Side by side** | Two synced maps (same centre, zoom, bearing), year A and year B, with a shared cursor dot |
| **Blink** | Toggles A/B every 0.7 s; the eye catches changes instantly |
| **Difference** | Only the change: land → water in red, water → land (new chars) in blue, from the classified images |

- Two compact year pickers ("From 2016" / "To 2025").
- Under the map: "Between 2016 and 2025, 1,240 ha of land disappeared in this view, including 38 ha of settlements" (sum of `target_eroded_ha` from `timeseries/segments.json` for stretches in view, or of erosion polygons in view).
- Implementation: `@maplibre/maplibre-gl-compare` for swipe, or two `<Map>` components sharing a `viewState` for side by side.

---

## Step 8: Area details bar (hover strip)

A slim bar at the bottom of the map that updates as the mouse moves: details at a glance without clicking.

### Content by what is under the cursor

| Under the cursor | Strip shows |
|---|---|
| Union | Name · region · threat score with coloured pill · rank "#4 of 82" · people within 2 km of bank · buildings · **sparkline** of hectares lost per year · "Click for details" |
| Risk stretch | Union · bank side (west/east) · 2026 risk (High/Medium/Low) and model score % · eroded ha last 3 years · retreat last year (m) |
| Erosion patch | Monsoon year · area in ha · land or settlement · "≈ N football fields" |
| Bank line | Year · side |
| Empty map | Coordinates · distance to the nearest current bank line (Turf) · selected year |

### Behaviour

- Updates on `mousemove` with a small throttle (every ~50 ms); fades to the empty-map content after 300 ms of no feature.
- On touch screens the strip becomes a bottom sheet that appears on tap.
- Numbers use the selected language's digits (Bangla: ০১২৩…).

### Sketch

```jsx
export default function HoverStrip() {
  const hover = useApp((s) => s.hover);
  const { t } = useTranslation();
  if (!hover) return <Strip>{t("strip.idle")}</Strip>;
  if (hover.type === "union") {
    const u = hover.props;
    return (
      <Strip>
        <b>{u.union_name}</b> · {t(`region.${u.region}`)}
        <Pill level={u.threat_level}>{u.threat_score.toFixed(2)}</Pill>
        <span>#{u.rank} / 82</span>
        <span>{fmt(u.population)} {t("people")}</span>
        <Sparkline values={unionSeries(u.union_id)} />
      </Strip>
    );
  }
  // ... stretch, erosion, bankline
}
```

---

## Step 9: Details drawer for unions and bank stretches

Clicking opens a right-side drawer (bottom sheet on phones) with tabs. The map flies to the feature and dims everything else (a "spotlight" mask).

### 9.1 Union card (`UnionCard.jsx`)

**Header:** union name (English + Bangla), upazila/region, threat level pill, rank badge "#4 of 82".

**Tab "Overview"**
- **Score gauge**: half-circle gauge 0–1 for `threat_score`, with marks at 0.5 and 0.7 (Medium / High).
- **Score breakdown**: stacked bar showing how much comes from model risk (50%), recent retreat (20%), people (20%), buildings (10%). Hover a part → plain-language sentence.
- **Stat cards** (count-up): people within 2 km of the bank, buildings, bank stretches (`stretches`), High-risk stretches (`high_stretches`).
- **Mini-map** of the union with its stretches coloured by risk.

**Tab "History"**
- **Bar chart**: hectares lost per monsoon 2015–2025 (land vs settlement stacked).
- **Bank movement chart**: average bank position per year (line), with retreat shown as a shaded area.
- **"Biggest year"** callout: "Monsoon 2020: 312 ha lost, the worst year here."
- Click a bar → the main time slider jumps to that year.

**Tab "Forecast"**
- List of the union's stretches sorted by 2026 risk, each with a small probability bar.
- Hindcast record for this union: "In 2023–2025 the model flagged 9 stretches here; 6 really eroded (hits), 2 were missed."

**Tab "Alert"**
- The Bangla alert text (if High), play button for audio, "Copy text" and "Share" buttons.

### 9.2 Bank stretch card (`StretchCard.jsx`)

- Header: "West bank, stretch 112 · Kaijuri union".
- **Risk dial**: model probability as a ring, with the 2026 class.
- **Why this stretch?** Top 3 reasons in plain words, built from the feature values (and SHAP if exported), e.g.:
  - "The land behind this bank was river bed for much of 1984–2021 (old, weak land)."
  - "Open water runs right against the bank (not a protecting sandbar)."
  - "It lost 7.4 ha last monsoon."
- **Timeline**: eroded ha per year (bars) + retreat in metres (line).
- **Bank position over time**: small chart of `bank_x` over the years: the bank "walking" east or west.
- **Exposure**: people and buildings in the 2 km zone behind it.
- **Hindcast**: for 2023–2025, did the model flag it, and did it erode (hit / miss / false alarm chips).

---

## Step 10: Forecast, hindcast and 3D risk views

### Mode switch (top of the layer panel)

| Mode | What the map shows |
|---|---|
| **Explore** | Time slider, imagery, erosion, bank lines |
| **Forecast 2026** | Risk stretches coloured High/Medium/Low, union threat fill; time slider locked to 2026 with a "Forecast" badge |
| **Hindcast 2023–25** | Hit / missed / false alarm / correct quiet per stretch; a year switch 2023 / 2024 / 2025; a score panel "Caught 50% of major erosion events while flagging 20% of the bank" |

### 3D risk

- Toggle "3D": tilt the map (pitch 55°) and **extrude** each risk stretch by its probability (`fill-extrusion-height = prob × 3000 m`). The riskiest stretches rise like walls along the river.
- Optional deck.gl `ColumnLayer` with one column per union, height = threat score, colour = level.
- Gentle auto-rotate (bearing animation) on the Home page hero.

### Animated "river flow"

deck.gl `TripsLayer` along the river centre line (between west and east banks) to show flow direction as moving light streaks. Pure decoration, but it makes the map feel alive. Turn it off for `prefers-reduced-motion`.

### Honesty note on the forecast

A small info chip on every forecast view: "Forecast for the 2026 monsoon. It can be checked when the next dry-season image is available (May 2027). The hindcast shows how well the method worked on 2023–2025."

---

## Step 11: Union ranking, search and "my location"

### Ranking page (`/unions`)

- TanStack Table with columns: rank, union, region, threat score (bar inside the cell), level, High stretches, people, buildings, **sparkline** of hectares lost per year.
- Sort by any column; filter chips: region, level; text search.
- Row hover highlights the union on a small locator map at the side; click → `/map?u=<id>` with the drawer open.
- "Download CSV" button (the current filtered view).
- Top of page: three podium cards for the top 3 unions with count-up scores.

### Global search (top bar, `⌘K` / `Ctrl+K`)

- Command-palette style search over union names (English + Bangla), upazilas, and places (OpenStreetMap Nominatim, limited to the study area).
- Results grouped: Unions, Places. Enter → fly to and open the card.

### "My location" (phones)

- Button with the GPS icon → browser geolocation (asks permission).
- Shows: your union, its threat level, distance to the nearest current bank line, and how far that bank moved in recent years ("This bank moved 180 m toward you between 2022 and 2025").
- Careful wording: no "years until it reaches you" countdown; past movement is not a promise about the future.

---

## Step 12: Insights page (charts that tell the story)

Scroll-driven sections, each with one chart and two sentences.

1. **"How much land did the river take?"**: stacked bars per monsoon 2015–2025, Gaibandha vs Sirajganj; toggle "near the main banks" vs "whole river belt (incl. chars)".
2. **"Banks vs chars"**: donut showing that ~80–90% of radar-detected loss is char erosion inside the river, and 10–20% at the main banks.
3. **"The river is walking"**: bank retreat profile: x-axis = distance along the river (km), y-axis = retreat in a chosen monsoon (m); a year selector animates between years. Spikes = hotspots.
4. **"Does the model beat simple rules?"**: grouped bars for PR-AUC, recall and precision of random, persistence, 3-year mean, logistic regression and gradient boosting (`results_time_split.json`); the winner highlighted; a toggle to show the cross-region test (`results_cross_region.json`).
5. **"What makes a bank fail?"**: horizontal bars of feature importance with plain-language labels (old riverbed behind the bank, open water at the bank, erosion last year…).
6. **"Who is exposed?"**: bubble chart of unions: x = threat score, y = people within 2 km, bubble size = buildings, colour = level. Hover → union name; click → map.
7. **"Radar sees through clouds"**: a small illustration comparing the number of usable optical vs radar images per monsoon month (cloud cover makes optical images rare).

Every chart: hover tooltips, keyboard focusable, "download PNG" and "view data" (table) buttons.

---

## Step 13: Alert centre (Bangla text, audio, SMS preview)

- Cards for each High union (`alerts_bn.json`), sorted by rank, with the Bangla text in a large readable font.
- **Phone mock-up**: the alert shown inside an SMS bubble on a phone frame; switch between "SMS" and "voice call" views.
- **Play** button for the voice alert (`alert_1.mp3`; later one file per union); a waveform animation while playing (Web Audio API `AnalyserNode`).
- "Copy text", "Share" (Web Share API on phones), "Print notice": a print stylesheet that makes an A4 notice with the union map and the Bangla text, for the union parishad notice board.
- Language note: union names currently come in English spelling from geoBoundaries; add a small `union_names_bn.json` lookup for Bangla names.

---

## Step 14: "How it works" interactive explainer

Teach the method with small hands-on widgets.

1. **Radar in one picture**: animated SVG: satellite sends a pulse; smooth water reflects it away (dark), rough land sends it back (bright).
2. **Threshold playground**: a slider from −18 dB to −11 dB over a small radar crop; the land/water mask updates live (pre-render masks for the thresholds tested: −18, −17, −16.5, −16, −15.5, −15, −14.5, −14, −13.5, −13.2, −13, −12.5, −12, −11). Show the balanced accuracy for each value and mark the chosen −15.0 dB as the best.
3. **From two years to erosion**: two classified crops (year Y and Y+1) and a third panel where pixels that were land and became water light up; a toggle to show the filters (≥ 1 ha, touching the river) removing noise.
4. **From bank to stretches**: the bank line cut into 500 m pieces, each piece a row in a table that fills as you scroll.
5. **The honest test**: a timeline graphic: "trained on 2015–2022, tested on 2023–2025 it had never seen".
6. **Limits**: a short, plain list (10 years of history, settlements from radar brightness, snapshot population, weights are choices).

---

## Step 15: Story mode and guided tour for judges

### Story mode (`/` Home, scrollytelling)

Use `IntersectionObserver` (or `react-scrollama`) to drive the map as the reader scrolls:

| Scroll section | Map action |
|---|---|
| "Every monsoon, the Jamuna moves." | Fly over the whole reach, slow bearing rotation, 3D terrain-like tilt |
| "Clouds hide it from optical satellites." | Fade a cloud overlay over the map |
| "Radar sees through." | Cloud layer dissolves; radar view appears |
| "12 years, one river." | Auto-play the time slider 2015 → 2026 |
| "Where it took homes." | Zoom to the biggest settlement-loss patch; pulse it |
| "Where it will strike next." | Switch to Forecast 2026 with 3D risk walls |
| "Who needs to know." | Union threat fill, top 3 cards slide in, Bangla alert plays |
| "Explore it yourself." | Button into `/map` |

Big animated counters in the hero: hectares lost since 2015, people living within 2 km of a high-risk bank, unions on High alert (13).

### Guided tour (react-joyride)

A "Take the tour" button runs 8 steps that match the judges' demo order: time slider → compare swipe → hover strip → union card → forecast mode → hindcast score → ranking → alert centre. Each step has one sentence and highlights the control.

---

## Step 16: Map tools (measure, draw, share, export)

| Tool | What it does | How |
|---|---|---|
| **Draw an area** | User draws a polygon (e.g. around a village) → panel shows hectares lost inside it per year, settlements lost, current distance to the bank | `@mapbox/mapbox-gl-draw` (works with MapLibre) + Turf `intersect` / `area` on erosion polygons |
| **Measure distance** | Click two points → distance; snap to the bank line | Turf `distance`, `nearestPointOnLine` |
| **Probe a point** | Click any point → the year it last changed from land to water, and its class every year as a strip of 12 coloured squares | Look up the classified images per year (pre-exported per-pixel history in tiles, or sample the WebP images in a canvas) |
| **Share view** | Copy link with the exact state (year, layers, selection, camera) | URL state from Step 4 |
| **Snapshot** | Download the current map as PNG with title, legend and date | `map.getCanvas().toDataURL()` (map created with `preserveDrawingBuffer: true`) |
| **Export GIF** | Record the time-lapse of the current view as an animated GIF/MP4 for social media | Step through years, capture canvas frames, encode with `gif.js` or `MediaRecorder` |
| **Data download** | GeoJSON/CSV of what is on screen | Filter loaded features by map bounds |

---

## Step 17: Bangla / English, accessibility, mobile

### Bangla / English

- `react-i18next` with `en.json` and `bn.json`; every label, legend, tooltip and chart axis translated.
- Number formatting with `Intl.NumberFormat("bn-BD")` for Bangla digits; dates with Bangla month names.
- Region and union names from a lookup table; fall back to English when missing.
- Language choice remembered in `localStorage`.

### Accessibility

- All controls keyboard-reachable (Radix primitives), visible focus ring in `--river`.
- Colour-blind safe palettes (Step 3); patterns or icons in addition to colour.
- Every chart has a "view as table" alternative and `aria-label` summary ("Bars: hectares lost per monsoon; highest 2020 with 1,878 ha in Sirajganj").
- Map: a text list of visible unions next to the map for screen readers; `aria-live` region announces the year when the slider moves.
- `prefers-reduced-motion` stops auto-play, rotation, pulses and flow animation.
- Contrast at least 4.5:1 for text on panels.

### Mobile

- Map full screen; layer panel becomes a bottom sheet with a drag handle; details drawer becomes a bottom sheet with snap points (peek / half / full).
- Time slider stays docked at the bottom, large touch targets (44 px).
- Hover strip → tap-to-inspect.
- Test on a low-end Android phone over 3G (Chrome DevTools throttling): first screen in under 4 s.

---

## Step 18: Performance

- **Vector tiles (PMTiles)** for erosion polygons and bank lines of all years; GeoJSON only for small layers (unions, stretches).
- **Raster tiles** for imagery once deployed (only visible tiles load); WebP format.
- **Code splitting**: `React.lazy` per page; deck.gl, charts and the draw tool load only when used.
- **Memoise** layer style objects (`useMemo`) so MapLibre does not re-parse styles on each render; update filters with `setFilter` instead of rebuilding sources.
- **Web Worker** for Turf calculations on drawn areas.
- **Preload** neighbouring years' images during playback.
- Target: Lighthouse performance ≥ 85 on mobile, interaction under 100 ms when dragging the slider.

---

## Step 19: Testing

| Level | Tool | What to test |
|---|---|---|
| Unit | Vitest | Formatters (Bangla digits, ha, %), colour scales, URL state encode/decode, totals in view |
| Component | React Testing Library | Slider changes year in the store; hover strip shows the right card; drawer tabs; ranking sort/filter |
| End-to-end | Playwright | Load `/map`, drag the slider to 2020, open a union card, switch to Forecast, open compare, share link reproduces the view |
| Visual | Playwright screenshots | Main screen in light/dark, English/Bangla, desktop/mobile |
| Data checks | Vitest | Every union in `unions.geojson` has a series in `timeseries/unions.json`; 82 unions; 13 High; years 2015–2026 present |

---

## Step 20: Build and deploy

```
cd frontend
npm run build          # outputs frontend/dist/
npm run preview        # check the production build locally
```

- Copy or symlink `data/web` outputs into `frontend/public/data/` as part of a small `npm run data` script (or have the Python export write there directly).
- Host the static site for free on **GitHub Pages**, **Netlify** or **Vercel**. Large imagery tiles go to a free object store (e.g. Cloudflare R2) or GitHub Releases as PMTiles, loaded by URL.
- Add attribution in the footer: Copernicus Sentinel data (ESA), Google Earth Engine, JRC Global Surface Water, MERIT Hydro, Google Open Buildings, WorldPop, geoBoundaries, Esri World Imagery, OpenStreetMap.
- Later: a small FastAPI service (`/unions`, `/segments`, `/history`) can replace static JSON when the pipeline runs every year; the frontend only changes its data URLs.

---

## Appendix: priorities if time is short

| Priority | Feature | Step |
|---|---|---|
| Must | Map with unions, risk stretches, bank lines, legend | 5 |
| Must | **Time slider with satellite/radar/classified images and synced erosion** | 2, 6 |
| Must | Hover strip with key numbers | 8 |
| Must | Union and stretch drawer with history charts | 9 |
| Must | Forecast and hindcast modes | 10 |
| Should | Before/after swipe | 7 |
| Should | Ranking page and search | 11 |
| Should | Bangla toggle and alert centre | 13, 17 |
| Should | Insights charts | 12 |
| Nice | Story mode, guided tour | 15 |
| Nice | 3D risk walls, river flow animation | 10 |
| Nice | Draw/measure, GIF export, threshold playground | 14, 16 |

A strong hackathon demo needs only the "Must" rows plus the swipe: one screen where a judge drags the slider, watches a bank disappear, clicks the union, and sees who is at risk next.
