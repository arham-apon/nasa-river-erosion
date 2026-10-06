# Dataset Context: Char Erosion Watch

Complete reference for the project: the goal, the study areas, what data is collected, how every script works, where the files live, and how to use them. Written on 2026-10-05.

> Status labels used below: **[done]** = confirmed in this project, **[configured]** = set in code but not confirmed run, **[not built]** = planned only.

---

## 1. What we are ultimately doing

**Project:** Char Erosion Watch, for the NASA Space Apps Challenge 2026, challenge "Dancing with the SARs".

**Problem.** Every monsoon, Bangladesh's big rivers (Jamuna/Brahmaputra, Padma) eat away farmland, homes and schools. Families often get little warning. Official erosion assessments rely on cloud-free optical satellite images, which are rarely available in monsoon season, so assessments arrive months late. Radar satellites see through clouds, day and night, so erosion can be mapped within weeks.

**Goal.**
1. Map where the riverbank eroded in past monsoons, using Sentinel-1 radar (method: Freihardt & Frey 2023, *NHESS* 23, 751).
2. Train a model on that history to estimate which 500 m stretches of bank are most likely to lose significant land in the **next** monsoon.
3. Combine erosion likelihood with exposure (buildings, people) and recent retreat speed into an **Erosion Threat Score per union** (the local government unit), ranked highest to lowest.
4. Deliver it as an interactive map dashboard, an API, and a prototype Bangla (voice/SMS) alert.

**Where we are.** Stage 1 (data collection and the feature-table pipeline) is written. The model, threat score, dashboard, API and alerts are **[not built]**.

```
Sentinel-1 radar (Earth Engine)
   -> yearly land/water/settlement maps  (02_gee_export.py, runs on Google servers)
   -> download .tif files to data/raw/   (manual, from Google Drive)
   -> erosion maps and polygons          (03_erosion.py)
   -> bank segments + feature table      (04_features.py)  => training_table.csv
   -> model (05_model.py)                [not built]
   -> Erosion Threat Score per union     [not built]
   -> map dashboard / API / alerts       [not built]
```

---

## 2. How the model will predict (important to understand)

The model **never sees an image**. Images are the source; the model input is a **table of numbers**, one row per (500 m bank segment, bank side, year).

- **Inputs (features):** `eroded_ha_lag1..3` (hectares lost 1, 2, 3 monsoons ago), `retreat_m_lag1..2`, `eroded_settlement_ha_lag1`, `bulge_m` (bank sticks out on a bend), `corridor_width_m` (river width), `landward_settlement_ha`, `side_is_west`.
- **Targets (answers):** `target` (1 if the segment lost >= 5 ha that monsoon), `target_eroded_ha`, `target_retreat_m`. These must **never** be used as features.
- **Training:** rows with a known answer (`split == "train"`).
- **Forecast:** rows with `split == "forecast"` are the newest year, whose answer is unknown. The model's predicted probability for those rows is the forecast.
- **Validation:** split by **year**, not randomly (e.g. train on monsoons <= 2022, test 2023-2025). A random split leaks the same place into train and test and gives falsely good scores.
- **Exposure** (`buildings`, `building_area_m2`, `population`, `union_name`, `union_id`) is *not* a cause of erosion. It is used only afterwards, in the threat score.
- **Suggested model:** gradient boosting (XGBoost/LightGBM or scikit-learn). With roughly 10 yearly observations, deep neural networks would overfit; tree models are also easier to explain to local authorities. An LSTM or CNN could be tested later as an experiment against the same year-split.

**Timing caveat (today is 2026-10-05).** The "forecast" rows are for the **2026 monsoon**, built from the dry season Nov 2025-Apr 2026. That monsoon has already happened. It can be checked only after the next dry season (Nov 2026-Apr 2027, `class_2027`) is available, around May 2027. Until then it is a demonstration forecast. A more useful framing is a *hindcast*: train through 2023, predict 2024 and 2025 as unseen years, show correct/missed/false-alarm segments on the map.

---

## 3. Study areas and Google Drive folders

There are two export areas. Both are Jamuna (Brahmaputra-Jamuna) reaches in northern Bangladesh. **Do not mix files from the two folders in one `data/raw/` directory:** the grids differ, and `03_erosion.py` stops if grids don't match.

### 3.1 Drive folder 1: `char_erosion_watch` (older, wider area)

| Item | Detail |
|---|---|
| Config at the time | `AOI_BBOX = [89.45, 24.40, 89.95, 25.30]` (west, south, east, north, degrees) |
| Size | about 50 km wide x 100 km tall, roughly 5,000 km² |
| Reach | Jamuna between about Sirajganj (south) and Gaibandha (north) |
| Jobs started | `class_2020` ... `class_2026`, `buildings`, `worldpop_2020` (9 jobs) |
| Last known status | 8 jobs completed; `class_2023` had been running 3 hours and looked stuck. Cancel and re-run it (`python 02_gee_export.py --years 2023 --skip-context --wait`) if not already done. **Confirm in Drive/the Tasks page.** |
| Not exported | 2015-2019 (so there is no baseline history for modelling from this folder) |
| Spot check | `class_2021.tif`: 0 = 16.4%, 1 = 73.5%, 2 = 10.1%, no nodata |

Note: the current `config.py` no longer points at this box. To re-export it, restore the old bbox and folder name.

### 3.2 Drive folder 2: `erosion_Shaghata_and_Fulchhari_Gaibandha` (current target)

| Item | Detail |
|---|---|
| Config now | `AOI_BBOX = [89.50, 25.04, 89.95, 25.42]`, `DRIVE_FOLDER = "erosion_Shaghata_and_Fulchhari_Gaibandha"` |
| Size | 0.45° lon x 0.38° lat, about 45 km x 42 km, roughly 1,900 km² |
| Reach | Shaghata and Fulchhari upazilas, Gaibandha district, west bank of the Brahmaputra-Jamuna, plus the river channel and chars |
| Intended jobs | `class_2015` ... `class_2026` (12 maps), `buildings`, `worldpop_2020` = 14 jobs |
| Status | **[configured]**. I have not started this export. Check Drive and the Earth Engine Tasks page to see if it was run. |
| Orbit check | Orbits 114 (ascending) and 150 (descending) cover the whole box. Checked for 2020, 2023, 2026: every part of the box had at least 5 images per orbit, mean about 14-15. (2026 descending had 15 scenes against 28-30 for others; still fine.) |
| Not yet tested | 2015-2019 image availability. `02_gee_export.py` aborts the **whole run** (before starting any job) if any requested season has zero ascending or descending images. If that happens for 2015, run `--years 2016 2017 ...` instead or set orbits to `None`. |

Overlap: lat 25.04-25.30 of the new box lies inside folder 1's box; only the northern strip 25.30-25.42 is new. The raster grids are still different, so keep the files separate.

### 3.3 Details of the two upazilas (from notes pasted into the chat; compiled from Banglapedia, BBS, CEGIS, BWDB; not independently verified)

**Fulchhari Upazila.** 306.4 km², 25°06′-25°23′N, 89°34′-89°46′E. Brahmaputra-Jamuna flows along its eastern flank. Gaibandha Sadar lies north, Shaghata south. Seven unions: Udakhali, Uriya, Kanchipara, Gajaria, Fulchhari, Fazlupur, Erendabari. More than half the area is chars (detached sandbar islands); Erendabari and Fazlupur are almost entirely char unions. Original upazila HQ, police station and Fulchhari Ghat were eaten by the river in the late 1990s-early 2000s; HQ moved inland to Kalirbazar (Udakhali). Annual embankment breaches at Uriya, Gajaria, Katlamari; hundreds of hectares of farmland and primary schools lost in Uriya and Fazlupur. The Katlamari-Kalirbazar embankment has repeatedly breached, leaving several km of western shoreline exposed. Population 165,848 in 42,912 households (BBS 2022 provisional).

**Shaghata Upazila.** 225.67 km² (up to 231.02 km² with seasonal char), 25°04′-25°14′N, 89°35′-89°45′E. On the west bank of the Jamuna, downstream of Fulchhari. Sonatala (Bogura) to the south, Gobindaganj to the west. Ten unions: Bonarpara, Ghuridaha, Padumshahar, Bharatkhali, Shaghata, Muktinagar, Kachua, Holdia, Jaldhunga, Kamalerpara. Holdia and Jaldhunga lie on the active channel with large shifting chars (Digalkandi, Patildaho). Settlements damaged or lost: Holdia, Guabari, Chinirpatol, Gobindi, Dhangora, Katlamari. Repeated breaches of the Brahmaputra Right Embankment (BRE) on the Holdia-Shaghata belt; Bharatkhali railway ghat has suffered subsidence. About 8-10 km of bank from Holdia toward the Bogura border has no permanent revetment or geobag protection. Population 295,213 in 77,419 households (BBS 2022 provisional).

**Why this reach is interesting.** It sits just downstream of the Teesta-Brahmaputra confluence (high sand flux, fast char formation, channel avulsion). It contains a lost-headquarters benchmark (old Fulchhari), and contrasting embankment sections (hard points near Bharatkhali/Shaghata vs breach zones at Holdia/Uriya). Opposite (east) bank: Dewanganj and Islampur (Jamalpur) and the southern tip of Rajibpur (Kurigram).

### 3.4 Other candidate sites (from your screenshot; not covered by any export)

| Site | River | Risk label | Rating | Note |
|---|---|---|---|---|
| Chauhali + Kazipur, Sirajganj | Jamuna | Very high | 5 stars | Keep. Likely near/inside folder 1's box; check coordinates |
| Shaghata + Fulchhari, Gaibandha | Jamuna | Very high | 5 stars | Keep. **This is the current target (folder 2)** |
| Naria + Harirampur | Padma | Very high | 5 stars | Keep, but separate geographically |
| Sadar + Ulipur, Kurigram | Brahmaputra/Jamuna + Dharla | Very high | 4.5 stars | Keep; north of the current boxes |
| Shibchar, Madaripur | Padma | High | 4 stars | Keep |

Padma sites need extra work: see section 10.

---

## 4. Environment and setup

- Folder: `C:\Users\User\Desktop\nasa` (not a git repository).
- Python virtual environment: `nenv` (activate with `nenv\Scripts\activate`). Python 3.14 per the pip output.
- Earth Engine: authenticated (`earthengine authenticate` done). Cloud project in `config.py`: `GEE_PROJECT = "nasa-river-erosion"`.
- Libraries are in `requirements.txt`: `earthengine-api`, numpy, pandas, scipy, geopandas, rasterio, shapely, pyproj, fiona, scikit-learn, tqdm, requests. The pip output you pasted showed the Earth Engine dependencies installing; confirm the geospatial ones (`rasterio`, `geopandas`) are installed before running steps 03/04. (`rasterio` already worked when you ran the class-2021 check.)
- Docs in the folder: `README.md` (setup and run steps; still mentions the old Drive folder name `char_erosion_watch`), `what-to-do.md` (identical copy of the README), `char_erosion_watch_overview.md` (project pitch), `padma_erosion_workflow.md` (in Downloads; see section 10).

---

## 5. File-by-file, function-by-function code explanation

### 5.1 `config.py` (all settings, no logic)

| Setting | Value | Meaning |
|---|---|---|
| `GEE_PROJECT` | `nasa-river-erosion` | Google Cloud project used for Earth Engine |
| `DRIVE_FOLDER` | `erosion_Shaghata_and_Fulchhari_Gaibandha` | Drive folder that exports go to |
| `AOI_BBOX` | `[89.50, 25.04, 89.95, 25.42]` | Study rectangle (west, south, east, north) |
| `CRS` | `EPSG:32645` | UTM zone 45N, metres; all exports use it |
| `SCALE_NATIVE` | 10 | Sentinel-1 working resolution (m) |
| `SCALE_EXPORT` | 20 | Export resolution (m) |
| `FIRST_DRY_SEASON`, `LAST_DRY_SEASON` | 2015, 2026 | Range of seasons exported/processed. Year N = dry season Nov (N-1) to Apr N. (`LAST_DRY_SEASON` is defined twice in the file; harmless) |
| `ASC_ORBIT`, `DESC_ORBIT` | 114, 150 | Sentinel-1 relative orbit numbers. `None` = accept any orbit |
| `INCIDENCE_MIN/MAX` | 30, 45 | Keep only pixels with radar incidence angle in this range (degrees) |
| `BOXCAR_RADIUS_PX` | 3 | Smoothing window radius, i.e. 7x7 pixels |
| `LAND_THRESHOLD_DB` | -13.2 | Land/water cut-off in dB (from the paper) |
| `PS_DISPERSION_MAX` | 0.4 | Settlement test: max amplitude dispersion |
| `PS_MEAN_DB_MIN` | -4.0 | Settlement test: min mean brightness (dB) |
| `VALIDATION_YEARS` | 2019-2026 | Seasons used by the threshold check |
| `VALIDATION_THRESHOLDS` | -15.0 ... -11.0 | Thresholds tested |
| `VALIDATION_POINTS` | 8000 | Random sample points |
| `NDVI_VEG` | 0.1 | NDVI above this counts as vegetation |
| `BUILDING_CONFIDENCE` | 0.75 | Min confidence for Open Buildings |
| `WORLDPOP_YEAR` | 2020 | Population year |
| `MIN_PATCH_PX` | 10 | Erosion patches smaller than this are dropped |
| `CORRIDOR_CLOSING_ITER` | 3 | Morphological closing steps when finding the river corridor |
| `SEGMENT_LENGTH_M` | 500 | Bank segment length |
| `BANK_BUFFER_M` | 2000 | Landward zone width behind the bank |
| `BANK_TOLERANCE_M` | 60 | Window riverward of the bank for counting erosion |
| `MIN_VALID_ROW_FRACTION` | 0.5 | Segment needs at least this share of valid rows |
| `EROSION_TARGET_HA` | 5.0 | Hectares that make `target = 1` |
| `ROOT`, `DATA`, `RAW`, `PROCESSED` | | `DATA` = `./data` unless env var `CEW_DATA` is set; `RAW` = `data/raw`, `PROCESSED` = `data/processed` |

### 5.2 `gee_common.py` (shared Earth Engine logic)

- **`init()`** starts Earth Engine with `GEE_PROJECT`.
- **`aoi()`** returns the study rectangle as an Earth Engine geometry (planar, not geodesic, in EPSG:4326).
- **`dry_season(end_year)`** returns `(1 Nov of end_year-1, 1 May of end_year)`. The end is exclusive, so it covers Nov-Apr.
- **`s1_db(start, end, orbit_pass, orbit_number)`** builds the Sentinel-1 collection `COPERNICUS/S1_GRD` for the box and dates, keeping: IW mode, 10 m resolution, has VV polarisation, the given pass direction (`ASCENDING`/`DESCENDING`), and (if not `None`) the given relative orbit. Each image is reduced to the `VV` band (already in dB), with pixels outside the 30-45° incidence-angle range masked out.
- **`image_counts(end_year)`** counts ascending (orbit 114) and descending (orbit 150) images for a season and returns them as a dictionary. Used as a safety check.
- **`land_db(end_year)`** takes the ascending collection, averages it into one composite (mean of dB), reprojects to UTM 45N at 10 m, applies a 7x7 mean filter, and names the band `db`. This smoothed backscatter is what gets thresholded into land/water.
- **`settlement(end_year)`** finds permanent bright scatterers (buildings) for each of ascending and descending: convert dB to power, then amplitude; compute **dispersion** = std/mean of amplitude over the season and the mean dB; a pixel counts as settlement if dispersion < 0.4 **and** mean dB > -4. The two directions are OR-ed (a building may only show from one side) and reprojected to 10 m.
- **`class_image(end_year)`** makes the final map: `land = land_db >= -13.2` (1 = land, 0 = water/sand); both land and settlement masks are downsampled from 10 m to 20 m (land with *mode*, settlement with *max*, over a 64-pixel window); settlement pixels are set to 2; masked pixels become 255 (nodata); the result is a `uint8` band named `cls`.

### 5.3 `01_validate_threshold.py` (optional check of the -13.2 dB cut-off)

- **`mask_s2(img)`** removes cloud/shadow/snow/saturated pixels from a Sentinel-2 image using its scene-classification band (classes 0, 1, 3, 8, 9, 10).
- **`veg_mask(end_year)`** builds a vegetation reference from Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`): scenes under 40% cloud, NDVI per scene, 90th-percentile NDVI over the dry season, vegetated if > 0.1.
- **`main()`** restricts to where JRC Global Surface Water shows water at some time (the river zone), draws 8,000 random points (seed 42), and for each season 2019-2026 compares the radar land mask at each of 10 thresholds against the NDVI vegetation mask. It prints the accuracy per threshold and per year and the best mean threshold. If the best differs from `LAND_THRESHOLD_DB` by 0.5 dB or more, update `config.py`. If it says "no ascending images", set `ASC_ORBIT = None`.
- Run it again after changing the study area, because the threshold was tuned on a different reach.

### 5.4 `02_gee_export.py` (starts the Earth Engine export jobs)

- **`class_task(year)`** creates a Drive export of `class_image(year)` as GeoTIFF named `class_<year>`, region = box, CRS UTM 45N, 20 m, `maxPixels=1e10`.
- **`buildings_task()`** reads `GOOGLE/Research/open-buildings/v3/polygons`, keeps buildings in the box with confidence >= 0.75, converts each polygon to its centroid, and exports a CSV `buildings.csv` with columns `lon, lat, area_m2, confidence`.
- **`worldpop_task()`** takes `WorldPop/GP/100m/pop` for Bangladesh (`BGD`) and year 2020, band `population`, as float, exports `worldpop_2020.tif` at 100 m.
- **`main()`** arguments: `--years` (list; default 2015..2026), `--skip-context` (skip buildings and WorldPop), `--wait` (poll every 60 s until all finish). It first checks `image_counts` for every year and exits with a message if any season has zero ascending or zero descending images. Then it starts every task (they run on Google's servers, so your PC can be off), prints the Tasks-page link, and with `--wait` prints the state of each task each minute and reports failures at the end.

### 5.5 `03_erosion.py` (erosion from consecutive dry seasons)

- **`load_year(year)`** reads `data/raw/class_<year>*.tif` (merging tiles if Earth Engine split the file) and returns the array, transform and CRS. Exits if none found.
- **`drop_small(mask, min_px)`** removes connected patches (8-connectivity) smaller than `MIN_PATCH_PX` pixels (noise).
- **`write_stack(path, arrays, names, transform, crs)`** writes a multi-band compressed GeoTIFF (uint8, nodata 255) with band descriptions.
- **`main()`**: loads every year from `FIRST_DRY_SEASON` to `LAST_DRY_SEASON`, checks all grids are identical (else asks you to re-export), and saves `class_stack.tif`. For each pair of consecutive dry seasons (before = year y, after = year y+1) the monsoon *y* erosion is: valid in both, was land or settlement before, and is sand/water after. Small patches are dropped. Output values: 1 = eroded land, 2 = eroded settlement, 255 = no data. It writes `eroded_stack.tif`, polygons (`erosion_polygons.gpkg`, with `monsoon`, `kind`, `area_ha`) and `erosion_summary.csv` (eroded ha per monsoon, total and settlement).

### 5.6 `04_features.py` (banks, segments, training table)

- **`read_stack(path)`** reads a stack and returns data, the years from band names, transform and CRS.
- **`corridor(cls)`** finds the river corridor for one year: water pixels (class 0), morphologically closed (`CORRIDOR_CLOSING_ITER`), keep the largest connected body, fill holes.
- **`bank_cols(corr)`** for each image row, the first corridor pixel from the left = west bank column; from the right = east bank column; -1 if the row has no corridor.
- **`window_sum(mask, cols, side, buf_px, tol_px)`** per row, counts mask pixels in a window around the bank: 2 km landward plus 60 m riverward. Used to count eroded area near the bank.
- **`landward_sum(mask, cols, side, buf_px)`** same but only the 2 km landward of the bank (used for settlement area behind the bank).
- **`seg_reduce(values, rows_per_seg, n_seg, how)`** groups rows into 500 m segments (25 rows at 20 m) and takes the median or sum; segments with under 50% valid rows become NaN.
- **`col_to_x(cols, transform)`** converts bank pixel columns to UTM x coordinates.
- **`bulge(x, side)`** the second difference of the bank position along the river, signed so that a positive value means the bank sticks out toward the river on a bend.
- **`bank_lines(...)`** builds west/east bankline polylines for every dry season (every 5th row) as a GeoDataFrame.
- **`load_unions(crs)`** loads `geoBoundaries-BGD-ADM4*.geojson/.shp` (not the "simplified" ones) from `data/raw`, keeping `shapeName`->`union_name` and `shapeID`->`union_id`. Skips with a message if missing.
- **`load_buildings(crs)`** reads `buildings.csv` into points, reprojected. Skips if missing.
- **`worldpop_sum(polys)`** sums WorldPop population inside each polygon. Skips if missing.
- **`main()`** for each dry season: corridor -> banks -> median river width per segment, per side the median bank x, settlement area behind the bank, eroded area near the bank (total and settlement), and bulge. Then builds one row per (segment, side, year). Then: `target_retreat_m` = how far the bank moves between this year and the next (west: x(y) - x(y+1); east: x(y+1) - x(y)); lag features by shifting each segment's history; `target` = 1 if `target_eroded_ha >= 5`; `split` = `forecast` where the target is unknown (the last year), else `train`. Exposure is computed once for the latest year: 2 km landward boxes per segment; count buildings inside, sum their area, sum WorldPop population, and attach the nearest union. Writes `training_table.csv`, `segments.gpkg` (landward zones, latest year) and `banklines.gpkg`.

**Row-year convention.** A row with `year = y` describes the dry season ending in April of y. Its target `target_eroded_ha` is the erosion in the monsoon of year y (comparison of dry season y with dry season y+1). Lag columns only use earlier, already-known monsoons. The last year (2026) has no target and is the forecast set.

---

## 6. End-to-end run order

```bash
# 0. once: activate environment, authenticate
nenv\Scripts\activate
earthengine authenticate

# 1. (optional) validate threshold for the current box
python 01_validate_threshold.py

# 2. export from Earth Engine to Drive (all 2015-2026 + context data)
python 02_gee_export.py --wait
#    only some years / no buildings+population:
python 02_gee_export.py --years 2023 --skip-context --wait

# 3. download the Drive folder into data\raw\ (manual), plus union boundaries
# 4. build erosion layers
python 03_erosion.py
# 5. build segments, features, training table
python 04_features.py
```

Typical run times seen: yearly exports took 5-17 minutes each on Earth Engine; steps 03 and 04 take about 2 minutes each.

Union boundaries download (geoBoundaries ADM4 for Bangladesh): https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM4/geoBoundaries-BGD-ADM4-all.zip. Unzip into `data/raw/`; the script uses `geoBoundaries-BGD-ADM4.geojson`.

---

## 7. Where the files are stored

| Stage | Location | Contents |
|---|---|---|
| Earth Engine output | Google Drive of the account that authenticated, folder named by `DRIVE_FOLDER` (`erosion_Shaghata_and_Fulchhari_Gaibandha` now; `char_erosion_watch` for the older export) | `class_YYYY.tif`, `buildings.csv`, `worldpop_2020.tif` |
| Downloaded raw data (you copy it) | `C:\Users\User\Desktop\nasa\data\raw\` (create it; keep one study area per folder, or set env var `CEW_DATA` to a different data root per area) | the Drive files + union boundaries |
| Processed | `C:\Users\User\Desktop\nasa\data\processed\` (created by the scripts) | `class_stack.tif`, `eroded_stack.tif`, `erosion_polygons.gpkg`, `erosion_summary.csv`, `training_table.csv`, `segments.gpkg`, `banklines.gpkg` |

Earth Engine never writes to your PC. Large exports may arrive split in tiles (`class_2020-0000000000-0000000000.tif`); `03_erosion.py` merges them. One test file, `class_2021.tif` from the old box, was downloaded to `C:\Users\User\Downloads\`.

Tip: use `set CEW_DATA=C:\path\to\data_gaibandha` before running steps 03-04 to keep each area's data in its own folder.

---

## 8. What the collected data is

### 8.1 `class_YYYY.tif` (the main dataset)
- One file per dry season. `class_2021` = Nov 2020-Apr 2021, `class_2026` = Nov 2025-Apr 2026.
- GeoTIFF, single band, `uint8`, 20 m pixels, EPSG:32645 (UTM 45N), every year on the same grid.
- Values: **0** sand or water, **1** vegetated land (agriculture, trees), **2** settlement (persistent bright radar scatterers), **255** no data.
- Built from the *ascending* Sentinel-1 composite (land/water) and both directions (settlement).
- 0, 1, 2 look almost black in a normal viewer; style it as categorical in QGIS.

### 8.2 `buildings.csv`
Columns `lon, lat, area_m2, confidence`: centroid of each Google Open Buildings v3 footprint in the box with confidence >= 0.75. The data is a recent snapshot, so it is used as current exposure only.

### 8.3 `worldpop_2020.tif`
Float raster, 100 m, EPSG:32645, estimated people per cell for Bangladesh in 2020.

### 8.4 Source datasets in Earth Engine
- `COPERNICUS/S1_GRD` (Sentinel-1, IW, VV, 10 m, ~every 12 days per orbit; the ascending pass is about 6 pm local time and descending about 6 am).
- `COPERNICUS/S2_SR_HARMONIZED` (Sentinel-2 optical, validation only).
- `JRC/GSW1_4/GlobalSurfaceWater` (water occurrence, used to restrict validation to the river zone).
- `GOOGLE/Research/open-buildings/v3/polygons`.
- `WorldPop/GP/100m/pop`.
- External: geoBoundaries ADM4 union polygons.

**Ascending vs descending.** The satellite moves south-to-north (ascending) or north-to-south (descending). Radar brightness depends on viewing direction, so mixing orbits would make unchanged land look different. We therefore use one fixed orbit per direction (114, 150), use the ascending one for land/water, and use both for settlements.

### 8.5 Derived data (after steps 03-04)
`class_stack.tif`, `eroded_stack.tif` (band per monsoon: 1 eroded land, 2 eroded settlement), `erosion_polygons.gpkg`, `erosion_summary.csv`, `training_table.csv` (columns above in section 2), `segments.gpkg`, `banklines.gpkg`.

---

## 9. How to use the TIFF files

- **QGIS** (free). Drag a `.tif` in, then Layer Properties -> Symbology -> *Paletted/Unique values* -> Classify (e.g. 0 blue, 1 green, 2 red, 255 transparent). Add a satellite basemap underneath to check the river and settlements look right. Open `erosion_polygons.gpkg` and `banklines.gpkg` the same way: eroded patches should hug the outer banks.
- **Python quick check:**
  ```python
  import rasterio, numpy as np
  src = rasterio.open(r"data/raw/class_2021.tif")
  a = src.read(1)
  print(src.shape, src.crs, src.res)
  u, c = np.unique(a, return_counts=True)
  print(dict(zip(u.tolist(), (c / a.size * 100).round(1).tolist())))
  ```
  A healthy file shows 0, 1 and 2, with 255 only outside the area. Water share should not jump wildly between years.
- **As model input:** do not feed the tifs directly. Run `03_erosion.py` and `04_features.py`, then use `training_table.csv`.
- **For the dashboard:** convert polygons/banklines to GeoJSON in EPSG:4326 (e.g. `gdf.to_crs(4326).to_file("x.geojson", driver="GeoJSON")`).

---

## 10. Things you might have missed: limitations, risks, to-dos

**Known limitations of the code**
1. **Bank tracing assumes the river runs roughly north-south.** `bank_cols` finds banks per image *row* and segments are runs of rows. This is fine for most of the Jamuna, but wrong for the Padma and for any diagonal or west-east river.
2. **The Shaghata-Fulchhari reach is braided with many chars.** `corridor()` keeps only the largest water body, so side channels or floodplain lakes can make the bank jump. Mitigations: lower `CORRIDOR_CLOSING_ITER` or raise it, shrink the box, and inspect `banklines.gpkg` in QGIS.
3. **Segment identity can drift.** Segments are numbered by image row, which works while the grid is fixed, but banks move; a fixed reference-centreline method would be more robust (see below).
4. **Exposure is static.** Buildings and population are one snapshot (2020/latest), applied to the latest-year zones and merged to all years.
5. **Union assignment** uses the nearest union to each segment's landward box centroid, so border segments may be assigned to the neighbouring union.
6. **Few independent years.** About 11 monsoons; neighbouring segments are correlated, so thousands of rows are not thousands of independent samples. Report honest year-split results and compare against baselines (predict zero, predict last year's value, 3-year mean).
7. **Threshold not re-validated** for the new box. Run `01_validate_threshold.py`.
8. **Settlement share (about 10% in the old box) is on the high side.** Check red pixels sit on real villages; if not, tune `PS_DISPERSION_MAX`/`PS_MEAN_DB_MIN`.
9. **2015 imagery** may be sparse (Sentinel-1 started October 2014); the pre-flight check can abort the whole export.
10. **No ground truth yet.** Radar land/water accuracy against Sentinel-2 is checked, but the erosion polygons are not yet compared with CEGIS published numbers (roughly 1,500 ha/year across the whole Jamuna; your reach should be a fraction).
11. The README still names the old Drive folder, and `what-to-do.md` duplicates it.

**Ideas from `padma_erosion_workflow.md` (in Downloads) worth adopting**
- Fixed reference centreline with perpendicular transects every 500 m and permanent segment IDs (e.g. `NARIA_L_042`) instead of row-based segments; left/right defined relative to flow.
- Manual label review of a stratified sample of erosion changes (accepted/rejected/uncertain); exclude uncertain ones from training. Track accretion separately; never subtract total land areas.
- Quality columns: valid fraction, scene counts before/after, orbit consistency, review status.
- Two targets: expected maximum retreat (regression) and major erosion (>= 20 m, classification); risk class (Low/Medium/High) computed afterwards.
- More features: bank curvature, orientation, distance to main channel, local water/sand fractions, VV mean and standard deviation, vegetation fraction, years eroded in last 3, retreat acceleration, elevation and slope.
- Split by target year plus a spatial hold-out of a 5-10 km sub-reach. Fit scalers, thresholds and calibration only on training data.
- Baselines (zero, persistence, 3-year mean), then XGBoost/LightGBM with modest settings (100-300 trees, depth 3-6) and no large hyperparameter search. LSTM only as a later experiment.
- Metrics: MAE/RMSE in metres, precision, recall, F1, PR-AUC, high-risk recall (missing a hotspot is worse than a false alarm); a map hindcast showing correct, missed and false-alarm segments.
- Example Threat Score: 0.50 x probability + 0.25 x normalised expected retreat + 0.15 x normalised exposed population + 0.10 x normalised exposed buildings. These weights are product choices, not physical truth.
- Image upload options: map-location selection (preferred), georeferenced GeoTIFF (supported), JPG/PNG (limited; no date or location, so it cannot independently predict erosion).
- Padma threshold must be calibrated on Padma samples; do not copy the Jamuna's -13.2 dB or orbit numbers.

**Planned deliverables (not built)**
- `05_model.py` (train, year-split test, 2026 forecast, union Threat Score, GeoJSON outputs).
- Web dashboard (MapLibre/Leaflet): banklines by year slider, eroded areas, risk-coloured segments, union ranking, click panels, threshold and weight sliders, English/Bangla toggle.
- API (e.g. FastAPI: `/unions`, `/segments`, `/history`) serving precomputed results.
- Bangla alert prototype (text templates or browser speech; real SMS needs a paid gateway).
- Methodology/dataset card: extent, dates, orbits, thresholds, label rules, split years, limitations, attribution.

**Extending to other reaches.** Make the area a named list in `config.py`, each reach with its own box, orbits, threshold and Drive folder, so scripts loop over reaches. For each new reach: check which orbits cover it, re-run the threshold validation, and for non-north-south rivers replace the row-based bank tracing.

**Next actions**
1. Confirm which of the two Drive exports finished (and re-run `class_2023` for folder 1 if needed).
2. Run `python 02_gee_export.py --wait` for the new box if not already started.
3. Download into `data/raw/` with the union boundary file.
4. Run `01_validate_threshold.py`, then `03_erosion.py`, `04_features.py`.
5. Inspect results in QGIS, then write `05_model.py` and build the map.

---

## 11. References

- Paper: https://nhess.copernicus.org/articles/23/751/2023/ (Freihardt & Frey 2023)
- Original Earth Engine code: https://doi.org/10.5281/zenodo.7253121
- Original app (2015-2019): https://doi.org/10.5281/zenodo.7252970
- Video tutorial: https://doi.org/10.5281/zenodo.7249809
- CEGIS erosion prediction (benchmark): https://www.cegisbd.com/LandmarkProj?prjid=4
- Earth Engine catalog: [COPERNICUS/S1_GRD](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD), [S2_SR_HARMONIZED](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), [JRC GSW](https://developers.google.com/earth-engine/datasets/catalog/JRC_GSW1_4_GlobalSurfaceWater), [Open Buildings v3](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings_v3_polygons), [WorldPop 100 m](https://developers.google.com/earth-engine/datasets/catalog/WorldPop_GP_100m_pop)
- Dynamic World and JRC Yearly Water History (suggested for extra validation): https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1
- Upazila notes sources (as cited in your pasted text): Banglapedia, BBS Census 2011/2022, CEGIS, BWDB
