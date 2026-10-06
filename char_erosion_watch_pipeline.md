# Char Erosion Watch: Simple Pipeline for Two Jamuna Regions

A step-by-step guide for running the whole project, from satellite data to the union ranking map, on two Jamuna reaches. It builds on the scripts you already have (`config.py`, `gee_common.py`, `01`–`04`) and adds three new ones (`02b`, `05`, `06`) plus a dashboard file.

Everything here is free. No credit card is needed anywhere.

---

## 0. Before you start

### 0.1 The two regions

| Region key | Upazilas | District | Status |
|---|---|---|---|
| `gaibandha` | Shaghata + Fulchhari | Gaibandha | Box already set: `[89.50, 25.04, 89.95, 25.42]` |
| `sirajganj` | Chauhali + Kazipur | Sirajganj | **New.** Needs its own box and its own export |

- Both reaches run roughly north to south, so the current row-based bank tracing in `04_features.py` still works. That is why we do not need the complicated transect method from the research report.
- The two regions are processed **separately** (different raster grids). They are only combined at the modelling step.
- Do **not** reuse the old `char_erosion_watch` Drive folder. It has no 2015–2019 data and does not reach Chauhali.
- Do **not** use the Sirajganj box from the Gemini report (`[89.45, 24.40, 89.95, 25.30]`). That is the old wide box; it overlaps Gaibandha and misses Chauhali.

### 0.2 The whole pipeline in one picture

```
Step 1  config: two regions
Step 2  check land/water threshold         (01_validate_threshold.py)   per region
Step 3  export radar class maps            (02_gee_export.py)           per region, runs on Google
Step 4  export extra free data   [NEW]     (02b_gee_extras.py)          per region, runs on Google
Step 5  download from Drive to data/<region>/raw
Step 6  erosion maps                       (03_erosion.py)              per region
Step 7  sanity checks                      (QGIS + Google Earth Pro)
Step 8  feature table                      (04_features.py + new features) per region
Step 9  train + test model       [NEW]     (05_model.py)                both regions together
Step 10 threat score + Bangla alerts [NEW] (06_threat_score.py)
Step 11 map dashboard            [NEW]     (dashboard.html)
Step 12 what to show the judges
```

### 0.3 What we improve compared with the current pipeline

| Change | Why it helps |
|---|---|
| Two regions with one switch (`CEW_REGION`) | Run the same scripts for both reaches without editing code each time |
| Threshold checked per region | The −13.2 dB cut-off was tuned elsewhere; a wrong cut-off makes fake erosion |
| 4 new free data layers (JRC water history, HAND height, Dynamic World water) | Tell the model whether a deep channel is hugging the bank and whether the land is young and weak |
| 3 extra features from existing columns (3-year mean, erosion count, acceleration) | Free signal; erosion repeats in the same places |
| Two guardrails on bank lines (smoothing + max-jump rule) | Stop banks from jumping to side channels or lakes in braided reaches |
| `landward_settlement_ha` removed from model inputs | It describes who lives there (exposure), not what causes erosion |
| Honest testing: year split + cross-region test + baselines | Shows the model really predicts, not memorises |
| Threat score uses percentiles, union score = 0.6 × worst segment + 0.4 × average | One dangerous stretch is not hidden by a calm union average |

### 0.4 What we are **not** doing from the research report, and why

| Report suggestion | Decision | Reason |
|---|---|---|
| Orthogonal transects, B-spline centreline | Skip | Both reaches run north–south; row-based banks are fine there. Big time cost |
| LSTM / CNN | Skip | Only ~10 years of data; they overfit |
| Huber regression + Platt calibration | Skip | One classifier is enough for a prototype; we rank segments instead of trusting raw probabilities |
| BWDB Bahadurabad discharge | Skip | Not available as a free, clean download |
| GloFAS, DEM slope, VV mean/std, NDVI, CHIRPS | Skip (CHIRPS optional) | Weak or same-for-all-segments signals; more work than value |

### 0.5 Time plan

| Step | Your working time | Waiting time |
|---|---|---|
| 1 Config | 20 min | – |
| 2 Threshold check | 10 min | 10 min per region |
| 3 + 4 Exports | 20 min | 1–3 h (Google servers; do Step 7 prep meanwhile) |
| 5 Download | 20 min | – |
| 6 Erosion | 5 min | 2 min per region |
| 7 Sanity checks | 45 min | – |
| 8 Features | 1–2 h | 2 min per region |
| 9 Model | 30 min | 1 min |
| 10 Threat score | 20 min | – |
| 11 Dashboard | 1 h | – |
| **Total** | **≈ 1 day of work** | |

### 0.6 Fast track (if time is very short)

Do Steps 1, 2, 3, 5, 6, 8 (without the new features), 9, 10, 11. Skip Step 4. `05_model.py` automatically uses only the columns that exist, so it still runs.

---

## Step 1: Set up two regions in `config.py`

### What and why

Right now `config.py` has one box. We make it hold both regions and pick one with an environment variable, so every script works for either region without editing.

### 1.1 Folder layout to create

```
nasa/
  config.py  gee_common.py
  00_region_bbox.py  01_validate_threshold.py  02_gee_export.py  02b_gee_extras.py
  03_erosion.py  04_features.py  05_model.py  06_threat_score.py
  data/
    boundaries/          <- union + upazila boundary files
    gaibandha/raw/       <- Drive files for Gaibandha
    gaibandha/processed/ <- created by scripts
    sirajganj/raw/
    sirajganj/processed/
    model/               <- created by 05
    web/                 <- created by 06; dashboard lives here
```

- Move your existing Gaibandha files from `data/raw/` into `data/gaibandha/raw/`.

### 1.2 Get the Sirajganj box (exact, from official boundaries)

1. Download upazila boundaries (geoBoundaries ADM3, free):
   https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM3/geoBoundaries-BGD-ADM3-all.zip
2. Download union boundaries (geoBoundaries ADM4, free):
   https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM4/geoBoundaries-BGD-ADM4-all.zip
3. Unzip both into `data/boundaries/`. You need `geoBoundaries-BGD-ADM3.geojson` and `geoBoundaries-BGD-ADM4.geojson`.
4. Copy `geoBoundaries-BGD-ADM4.geojson` also into `data/gaibandha/raw/` and `data/sirajganj/raw/` (`04_features.py` looks for it there).
5. Save this as `00_region_bbox.py` and run `python 00_region_bbox.py`:

```python
import geopandas as gpd

g = gpd.read_file("data/boundaries/geoBoundaries-BGD-ADM3.geojson")
sel = g[g["shapeName"].str.contains("chauhali|chowhali|kazipur", case=False, na=False)]
print(sel["shapeName"].tolist())
w, s, e, n = sel.total_bounds
print([round(w - 0.03, 2), round(s - 0.03, 2), round(e + 0.12, 2), round(n + 0.03, 2)])
```

- It prints the matched upazila names and a box `[west, south, east, north]`.
- The east side gets extra padding because the box must include the **whole river and the opposite bank**.
- If the name list is empty, run `print(sorted(g.shapeName))` and look for the spelling.
- If you cannot run it, use this approximate box: `[89.55, 24.00, 89.95, 24.85]`.

6. Check the box visually. Open https://code.earthengine.google.com, paste this, press **Run**:

```js
var box = ee.Geometry.Rectangle([89.55, 24.00, 89.95, 24.85]);
Map.setOptions('SATELLITE');
Map.centerObject(box, 9);
Map.addLayer(box, {color: 'red'}, 'box');
```

- The red box must contain both banks of the Jamuna plus about 2 km of land behind each bank, from north of Kazipur to south of Chauhali.

### 1.3 Edit `config.py`

Delete the existing lines that set `AOI_BBOX`, `DRIVE_FOLDER`, `LAND_THRESHOLD_DB`, `ASC_ORBIT`, `DESC_ORBIT` and remove the duplicate `LAST_DRY_SEASON`. Put this block in their place (near the top):

```python
import os

REGIONS = {
    "gaibandha": {
        "bbox": [89.50, 25.04, 89.95, 25.42],
        "folder": "erosion_Shaghata_and_Fulchhari_Gaibandha",
        "threshold_db": -13.2,
        "asc_orbit": 114,
        "desc_orbit": 150,
    },
    "sirajganj": {
        "bbox": [89.55, 24.00, 89.95, 24.85],
        "folder": "erosion_Chauhali_and_Kazipur_Sirajganj",
        "threshold_db": -13.2,
        "asc_orbit": 114,
        "desc_orbit": 150,
    },
}
REGION = os.environ.get("CEW_REGION", "gaibandha")
_R = REGIONS[REGION]
AOI_BBOX = _R["bbox"]
DRIVE_FOLDER = _R["folder"]
LAND_THRESHOLD_DB = _R["threshold_db"]
ASC_ORBIT = _R["asc_orbit"]
DESC_ORBIT = _R["desc_orbit"]
```

Then change the `DATA` line (it must stay **after** `ROOT` is defined) to:

```python
DATA = Path(os.environ["CEW_DATA"]) if os.environ.get("CEW_DATA") else ROOT / "data" / REGION
```

- Replace the Sirajganj `bbox` with the box printed in 1.2.

### 1.4 How to switch region

| Terminal | Command |
|---|---|
| Command Prompt (cmd) | `set CEW_REGION=sirajganj` |
| PowerShell | `$env:CEW_REGION = "sirajganj"` |

- The setting lasts until you close the terminal. Every script run afterwards uses that region.
- Check: `python -c "import config; print(config.REGION, config.AOI_BBOX, config.RAW)"`

### 1.5 Check which radar orbits cover Sirajganj

Orbits 114/150 were checked only for Gaibandha. With `CEW_REGION=sirajganj` set, run:

```
python -c "import ee, gee_common as g; g.init(); c = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(g.aoi()).filterDate('2024-11-01','2025-05-01').filter(ee.Filter.eq('instrumentMode','IW')); print(c.aggregate_histogram('relativeOrbitNumber_start').getInfo()); print(c.aggregate_histogram('orbitProperties_pass').getInfo())"
```

- It prints how many images each orbit number has.
- Then check which numbers are ascending vs descending in the Code Editor if needed, or simply try the export in Step 3: its pre-flight check stops with a message if an orbit has zero images.
- Rule: use the orbit with the most images in each direction. If two orbits of the same direction have similar counts, the box is split between them; set that orbit to `None` in `REGIONS`.

---

## Step 2: Check the land/water threshold (per region)

### What and why

The radar says "land" when the pixel is brighter than −13.2 dB. That number came from another reach. If it is wrong here, dry sand is called land (or land called sand), and you get fake erosion. The script compares the radar map with Sentinel-2 vegetation (optical) and tells you the best cut-off.

### How

```
set CEW_REGION=gaibandha
python 01_validate_threshold.py
set CEW_REGION=sirajganj
python 01_validate_threshold.py
```

- Read the "best threshold" line.
- If it differs from −13.2 by 0.5 dB or more, put the new value in `threshold_db` for that region in `config.py`.
- If it says "no ascending images", set that region's `asc_orbit` to `None`.

---

## Step 3: Export the radar class maps (per region)

### What and why

This makes one land/water/settlement map per dry season (2015–2026) on Google's servers and saves them to your Google Drive. These maps are the foundation for everything.

### How

```
set CEW_REGION=sirajganj
python 02_gee_export.py --wait
```

- For Gaibandha, first check the Drive folder `erosion_Shaghata_and_Fulchhari_Gaibandha` and the Tasks page (https://code.earthengine.google.com/tasks). Only run the export if the files are not already there.
- If the run stops because 2015 has zero images: `python 02_gee_export.py --years 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026 --wait`
- If one year gets stuck for more than 1 hour: cancel it on the Tasks page and run only that year: `python 02_gee_export.py --years 2023 --skip-context --wait`
- Your PC can be off while tasks run. Start Step 4 right away; both can run at the same time.

### Expected files in Drive (per region)

| File | Content |
|---|---|
| `class_2015.tif` … `class_2026.tif` | 0 = sand/water, 1 = vegetated land, 2 = settlement, 255 = no data |
| `buildings.csv` | Building centroids (Google Open Buildings) |
| `worldpop_2020.tif` | People per 100 m cell |

---

## Step 4: Export extra free data (NEW)

### What we add and why

| Layer | Source (free, in Earth Engine) | What it tells the model |
|---|---|---|
| Water history 1984–2021 | JRC Global Surface Water, `occurrence` band | How often the river has flowed here in the last 38 years. Land that was riverbed recently is young, sandy and erodes easily |
| Height above nearest river (HAND) | MERIT Hydro, `hnd` band | Low land near the river is weaker and gets soaked; higher terraces resist |
| Dry-season water probability per year | Google Dynamic World V1, `water` band | Our class map mixes sand and water into one class. This separates them: a deep channel right next to the bank attacks it; a sandbar in front protects it |

- All three come from Earth Engine, which you already use. Nothing to sign up for.
- Dynamic World starts in mid-2015, so the first dry season it covers is 2016. The 2015 rows will have empty values; the model handles empty values.

### How

Save this as `02b_gee_extras.py`:

```python
import argparse
import time

import ee

import config
from gee_common import aoi, dry_season, init

DW = "GOOGLE/DYNAMICWORLD_V1"


def export(img, name):
    task = ee.batch.Export.image.toDrive(
        image=img,
        description=f"{config.REGION}_{name}",
        folder=config.DRIVE_FOLDER,
        fileNamePrefix=name,
        region=aoi(),
        crs=config.CRS,
        scale=config.SCALE_EXPORT,
        maxPixels=1e10,
    )
    task.start()
    return task


def static_layers():
    jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").unmask(0).rename("jrc_occ")
    hand = ee.Image("MERIT/Hydro/v1_0_1").select("hnd").rename("hand_m")
    return jrc.addBands(hand).toFloat()


def dw_collection(year):
    start, end = dry_season(year)
    return ee.ImageCollection(DW).filterBounds(aoi()).filterDate(start, end).select("water")


def dw_water(year):
    return dw_collection(year).mean().multiply(100).round().unmask(255).toUint8().rename("dw_water")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--years", nargs="+", type=int,
                   default=list(range(max(2016, config.FIRST_DRY_SEASON), config.LAST_DRY_SEASON + 1)))
    p.add_argument("--skip-static", action="store_true")
    p.add_argument("--wait", action="store_true")
    a = p.parse_args()

    init()
    tasks = []
    if not a.skip_static:
        tasks.append(export(static_layers(), "static_layers"))
    for y in a.years:
        if dw_collection(y).size().getInfo() == 0:
            print(f"{y}: no Dynamic World images, skipped")
            continue
        tasks.append(export(dw_water(y), f"dw_water_{y}"))

    print(f"{config.REGION}: started {len(tasks)} tasks. Watch: https://code.earthengine.google.com/tasks")
    while a.wait:
        states = [t.status()["state"] for t in tasks]
        print(states)
        if all(s in ("COMPLETED", "FAILED", "CANCELLED") for s in states):
            break
        time.sleep(60)


if __name__ == "__main__":
    main()
```

Run it for each region:

```
set CEW_REGION=gaibandha
python 02b_gee_extras.py --wait
set CEW_REGION=sirajganj
python 02b_gee_extras.py --wait
```

### Expected new files in each Drive folder

| File | Bands / values |
|---|---|
| `static_layers.tif` | Band 1 `jrc_occ`: 0–100 (% of time water). Band 2 `hand_m`: metres above nearest river |
| `dw_water_2016.tif` … `dw_water_2026.tif` | 0–100 = water probability; 255 = no data |

- These names do not start with `class_`, so `03_erosion.py` ignores them. Safe to keep in the same folder.

### Optional: monsoon rainfall (skip if short on time)

- Source: CHIRPS Daily (`UCSB-CHG/CHIRPS/DAILY`), free in Earth Engine.
- Gives one number per year (same for every segment), so it adds little with only ~10 years.
- Important trap: at forecast time you do **not** know the coming monsoon's rain. Only the **previous** monsoon's rainfall is allowed as a feature.

---

## Step 5: Download everything into the right folders

1. Open Google Drive, right-click the folder `erosion_Shaghata_and_Fulchhari_Gaibandha` → Download. Unzip all files into `data/gaibandha/raw/`.
2. Same for `erosion_Chauhali_and_Kazipur_Sirajganj` → `data/sirajganj/raw/`.
3. Make sure `geoBoundaries-BGD-ADM4.geojson` is in both `raw` folders (Step 1.2).
4. Never mix files from the two regions in one folder; the grids differ and `03_erosion.py` will stop.

Quick check of one file:

```python
import rasterio, numpy as np
src = rasterio.open("data/sirajganj/raw/class_2021.tif")
a = src.read(1)
u, c = np.unique(a, return_counts=True)
print(src.shape, src.crs, dict(zip(u.tolist(), (c / a.size * 100).round(1).tolist())))
```

- Healthy: values 0, 1, 2 present; 255 small; the water share does not jump wildly between years.

---

## Step 6: Build erosion maps (per region)

### What and why

For every pair of dry seasons (before and after a monsoon), any pixel that was land before and is sand/water after is marked "eroded". Comparing dry seasons (not monsoon images) avoids mistaking floods for erosion.

### How

```
set CEW_REGION=gaibandha
python 03_erosion.py
set CEW_REGION=sirajganj
python 03_erosion.py
```

### Output in `data/<region>/processed/`

| File | Content |
|---|---|
| `class_stack.tif` | All dry seasons stacked |
| `eroded_stack.tif` | One band per monsoon: 1 = eroded land, 2 = eroded settlement |
| `erosion_polygons.gpkg` | Eroded patches with `monsoon`, `kind`, `area_ha` |
| `erosion_summary.csv` | Hectares eroded per monsoon |

---

## Step 7: Sanity checks (do not skip)

A model trained on wrong erosion maps learns nonsense. These checks take 45 minutes and protect everything after.

### 7.1 Look at the maps in QGIS (free: https://qgis.org)

1. Open QGIS → Layer → Add Layer → Add Raster Layer → pick `class_2021.tif`.
2. Layer Properties → Symbology → **Paletted/Unique values** → Classify. Colours: 0 blue, 1 green, 2 red, 255 transparent.
3. Add a satellite basemap: Browser panel → XYZ Tiles → right-click → New Connection → URL `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
4. Drag in `erosion_polygons.gpkg` and `banklines.gpkg` (after Step 8).

What good looks like:

- Blue = the river and sandbars. Green = fields. Red dots sit on real villages.
- Eroded patches hug the **outer** banks, mostly on bends.
- If red covers big empty fields, settlements are over-detected: lower `PS_DISPERSION_MAX` (e.g. 0.35) or raise `PS_MEAN_DB_MIN` (e.g. −3) and re-export.

### 7.2 Check 20 erosion patches against real imagery (Google Earth Pro, free)

1. Install Google Earth Pro: https://www.google.com/earth/about/versions/ (desktop version).
2. Export 20 random patches to KML:

```python
import geopandas as gpd
g = gpd.read_file("data/sirajganj/processed/erosion_polygons.gpkg")
g[g.area_ha > 2].sample(20, random_state=1).to_crs(4326).to_file("check_sirajganj.kml", driver="KML")
```

3. Open the KML in Google Earth Pro. Use the **clock icon** (historical imagery) to compare the year before and after that patch's `monsoon`.
4. Count how many are real erosion. If 15 or more of 20 are real, good. If fewer, revisit the threshold (Step 2).

### 7.3 Compare totals with official numbers

- CEGIS (Center for Environmental and Geographic Information Services) publishes yearly Jamuna erosion figures: https://www.cegisbd.com/LandmarkProj?prjid=4
- Whole Jamuna erosion is roughly 1,500 ha/year recently. Each of your regions should be a **fraction** of that (tens to a few hundred ha/year).
- If CEGIS PDFs are not downloadable, newspaper reports quoting CEGIS figures for these upazilas (e.g. The Daily Star) are an acceptable rough check.
- Write the comparison in your presentation; judges like a validation slide.

---

## Step 8: Build the feature table (per region)

### What and why

The model never sees images. It sees a **table**: one row per 500 m bank stretch, per bank side, per year. Each row has "features" (what we knew before the monsoon) and a "target" (what happened during the monsoon).

### 8.1 Run the existing script first

```
set CEW_REGION=gaibandha
python 04_features.py
set CEW_REGION=sirajganj
python 04_features.py
```

Outputs in `data/<region>/processed/`: `training_table.csv`, `segments.gpkg`, `banklines.gpkg`.

### 8.2 Changes to make in `04_features.py`

Send the current `04_features.py` file and get the full rewritten version back. These are the exact changes it needs:

**A. Two guardrails on bank lines** (stop jumps in braided reaches)

| Guardrail | Rule |
|---|---|
| Smooth the bank | After finding bank columns per row, apply a rolling median over 11 rows (≈220 m). Single-row spikes disappear |
| Max-jump rule | If a bank moves more than 1,000 m in one monsoon, treat that value as an error (set retreat to empty), not as real erosion |

**B. New features from Step 4 layers**

Each layer is first resampled onto the class grid, so tiny grid offsets don't matter:

```python
import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject


def load_on_grid(path, band, shape, transform, crs, nodata=None):
    out = np.full(shape, np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, band),
            destination=out,
            dst_transform=transform,
            dst_crs=crs,
            resampling=Resampling.nearest,
            src_nodata=nodata,
            dst_nodata=np.nan,
        )
    return out
```

Then per row, take values in a 500 m (25-pixel) strip next to the bank, and the median per segment (same way existing features are built):

| New column | Layer | Strip | Meaning |
|---|---|---|---|
| `jrc_occ_river` | `static_layers.tif` band 1 | 500 m riverward | Has the main channel stayed next to this bank for decades? |
| `jrc_occ_land` | `static_layers.tif` band 1 | 500 m landward | Is the land behind the bank old riverbed (weak)? |
| `hand_land_m` | `static_layers.tif` band 2 | 500 m landward | How high the land is above the river |
| `dw_water_river` | `dw_water_<year>.tif` (255 = empty) | 500 m riverward | Is open water (not sandbar) touching the bank this dry season? |
| `dw_water_change` | – | – | `dw_water_river` this year minus last year: is the channel moving toward the bank? |

- A row with `year = y` uses `dw_water_y` (dry season ending April y). That is before monsoon y, so no future information leaks in.

**C. Nothing else changes.** Targets, splits and exposure columns stay as they are.

### 8.3 The final table (what each column means)

| Column | Type | Plain meaning |
|---|---|---|
| `eroded_ha_lag1..3` | feature | Hectares lost 1, 2, 3 monsoons ago |
| `retreat_m_lag1..2` | feature | Metres the bank moved back 1, 2 monsoons ago |
| `eroded_settlement_ha_lag1` | feature | Settlement area lost last monsoon |
| `bulge_m` | feature | Bank sticks out into the river on a bend (positive = more exposed) |
| `corridor_width_m` | feature | River width here; narrow = faster flow |
| `side_is_west` | feature | West bank = 1 |
| `jrc_occ_river`, `jrc_occ_land`, `hand_land_m`, `dw_water_river`, `dw_water_change` | feature (new) | See 8.2 |
| `target` | answer | 1 if this stretch lost ≥ 5 ha in that monsoon |
| `target_eroded_ha`, `target_retreat_m` | answer | Never use as features |
| `split` | label | `train` = answer known; `forecast` = 2026 monsoon |
| `buildings`, `building_area_m2`, `population`, `union_name`, `union_id` | exposure | Used only in Step 10, never in the model |
| `landward_settlement_ha` | exposure | Excluded from the model (describes people, not erosion cause) |

---

## Step 9: Train and test the model (NEW: `05_model.py`)

### Which model and why

- **Gradient boosting** (scikit-learn `HistGradientBoostingClassifier`). Same family as LightGBM/XGBoost, already inside scikit-learn, so nothing new to install.
- Why: works well on small tables, handles empty values, fast on a laptop, and you can explain which features mattered.
- Why not deep learning: about 10 years of history is far too little; an LSTM would memorise noise.

### How we test honestly

| Test | Train on | Test on | What it proves |
|---|---|---|---|
| Time split | monsoons ≤ 2022, both regions | monsoons 2023–2025 | The model predicts years it has never seen |
| Cross-region | one region, ≤ 2022 | the other region, 2023–2025 | It learned river behaviour, not one place |
| Baselines | – | same test rows | The model must beat "random", "same as last year" and "3-year average" |

- Never split rows randomly. Neighbouring stretches and the same flood year would end up in both train and test, giving fake high scores.

### Metrics in plain words

| Metric | Meaning | Good sign |
|---|---|---|
| PR-AUC | How well high scores line up with real erosion (0–1). Random = share of eroding rows | Clearly above all baselines |
| Recall @ top 20% | If we flag the riskiest 20% of stretches each year, what share of real erosion events did we catch? | ≥ 0.6 is solid; ≥ 0.8 is great |
| Precision @ top 20% | Of the flagged stretches, how many really eroded? | Higher than the overall erosion rate |

- Missing a dangerous bank is worse than one false alarm, so recall matters most.

### Install / update

```
pip install -U scikit-learn pandas numpy
```

### The script

Save as `05_model.py` (run from the `nasa` folder; no `CEW_REGION` needed):

```python
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

REGIONS = ["gaibandha", "sirajganj"]
OUT = Path("data/model")
TRAIN_LAST = 2022
TEST_YEARS = [2023, 2024, 2025]
TOP_FRAC = 0.20
CANDIDATES = [
    "eroded_ha_lag1", "eroded_ha_lag2", "eroded_ha_lag3",
    "retreat_m_lag1", "retreat_m_lag2", "eroded_settlement_ha_lag1",
    "bulge_m", "corridor_width_m", "side_is_west",
    "eroded_3yr_mean", "erosion_count_3yr", "retreat_accel",
    "jrc_occ_river", "jrc_occ_land", "hand_land_m",
    "dw_water_river", "dw_water_change",
]


def load():
    frames = []
    for r in REGIONS:
        p = Path("data") / r / "processed" / "training_table.csv"
        if not p.exists():
            print(f"missing {p}, skipped")
            continue
        d = pd.read_csv(p)
        d["region"] = r
        frames.append(d)
    df = pd.concat(frames, ignore_index=True)
    lags = df[["eroded_ha_lag1", "eroded_ha_lag2", "eroded_ha_lag3"]]
    df["eroded_3yr_mean"] = lags.mean(axis=1)
    df["erosion_count_3yr"] = (lags >= 1).sum(axis=1)
    df["retreat_accel"] = df["retreat_m_lag1"] - df["retreat_m_lag2"]
    return df


def gbm():
    return HistGradientBoostingClassifier(
        max_depth=4, max_iter=200, learning_rate=0.05, min_samples_leaf=20,
        l2_regularization=1.0, class_weight="balanced", random_state=42,
    )


def logreg():
    return make_pipeline(
        SimpleImputer(strategy="median"), StandardScaler(),
        LogisticRegression(class_weight="balanced", max_iter=2000),
    )


def top_flags(score, groups):
    flags = np.zeros(len(score), dtype=bool)
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        k = max(1, int(round(TOP_FRAC * len(idx))))
        flags[idx[np.argsort(-score[idx])[:k]]] = True
    return flags


def evaluate(name, y, score, groups):
    flags = top_flags(score, groups)
    pos = int((y == 1).sum())
    tp = int((flags & (y == 1)).sum())
    return {
        "model": name,
        "pr_auc": round(average_precision_score(y, score), 3) if pos else np.nan,
        "recall_top20": round(tp / max(1, pos), 3),
        "precision_top20": round(tp / max(1, int(flags.sum())), 3),
        "positives": pos,
        "rows": len(y),
    }


def run_all(name_prefix, tr, te, feats):
    y = te["target"].to_numpy()
    groups = (te["region"] + "_" + te["year"].astype(str)).to_numpy()
    rows = [
        evaluate(f"{name_prefix}random", y, np.random.default_rng(0).random(len(te)), groups),
        evaluate(f"{name_prefix}persistence", y, te["eroded_ha_lag1"].fillna(0).to_numpy(), groups),
        evaluate(f"{name_prefix}3-year mean", y, te["eroded_3yr_mean"].fillna(0).to_numpy(), groups),
    ]
    lr = logreg().fit(tr[feats], tr["target"])
    rows.append(evaluate(f"{name_prefix}logistic regression", y, lr.predict_proba(te[feats])[:, 1], groups))
    m = gbm().fit(tr[feats], tr["target"])
    prob = m.predict_proba(te[feats])[:, 1]
    rows.append(evaluate(f"{name_prefix}gradient boosting", y, prob, groups))
    return rows, m, prob, groups


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    feats = [c for c in CANDIDATES if c in df.columns]
    print("features used:", feats)

    lab = df[(df["split"] == "train") & df["target"].notna()].copy()
    lab["target"] = lab["target"].astype(int)
    print("\nshare of stretches with major erosion:")
    print(lab.groupby("region")["target"].mean().round(3))

    tr = lab[lab["year"] <= TRAIN_LAST]
    te = lab[lab["year"].isin(TEST_YEARS)].copy()

    rows, model, prob, groups = run_all("", tr, te, feats)
    res = pd.DataFrame(rows)
    print("\nTIME SPLIT (train <= %d, test %s)" % (TRAIN_LAST, TEST_YEARS))
    print(res.to_string(index=False))
    res.to_csv(OUT / "results_time_split.csv", index=False)

    cross = []
    regions = sorted(lab["region"].unique())
    if len(regions) == 2:
        for a, b in [(regions[0], regions[1]), (regions[1], regions[0])]:
            r, _, _, _ = run_all(f"{a}->{b}: ", tr[tr["region"] == a], te[te["region"] == b], feats)
            cross += r
        cross = pd.DataFrame(cross)
        print("\nCROSS-REGION")
        print(cross.to_string(index=False))
        cross.to_csv(OUT / "results_cross_region.csv", index=False)

    imp = permutation_importance(model, te[feats], te["target"], scoring="average_precision",
                                 n_repeats=10, random_state=42)
    imp = pd.Series(imp.importances_mean, index=feats).sort_values(ascending=False).round(4)
    print("\nFEATURE IMPORTANCE (drop in PR-AUC when shuffled)")
    print(imp.to_string())
    imp.to_csv(OUT / "feature_importance.csv", header=["importance"])

    te["prob"] = prob
    te["flag_top20"] = top_flags(prob, groups)
    te["outcome"] = np.select(
        [te["flag_top20"] & (te["target"] == 1),
         ~te["flag_top20"] & (te["target"] == 1),
         te["flag_top20"] & (te["target"] == 0)],
        ["hit", "missed", "false_alarm"],
        "correct_quiet",
    )
    te.to_csv(OUT / "hindcast_predictions.csv", index=False)

    final = gbm().fit(lab[feats], lab["target"])
    fc = df[df["split"] == "forecast"].copy()
    fc["prob"] = final.predict_proba(fc[feats])[:, 1]
    pr = fc.groupby("region")["prob"].rank(pct=True)
    fc["risk_class"] = np.where(pr > 0.9, "High", np.where(pr > 0.7, "Medium", "Low"))
    fc.to_csv(OUT / "forecast_predictions.csv", index=False)
    print(f"\nsaved results to {OUT}/")


if __name__ == "__main__":
    main()
```

Run: `python 05_model.py`

### How to read the output

- **Share of stretches with major erosion.** If it is below 5%, lower `EROSION_TARGET_HA` in `config.py` (e.g. 3) and re-run Step 8. If above 40%, raise it (e.g. 10).
- **Time split table.** Gradient boosting should have higher PR-AUC and recall than persistence and 3-year mean. If it does not, that is still an honest result: say "past erosion is the strongest signal" and use the simplest model that wins.
- **Cross-region table.** If it works almost as well as the time split, the model generalises. Great slide.
- **Feature importance.** Usually past erosion and bank shape come first. Use the top 3 to explain the model in one sentence.

### Output files in `data/model/`

| File | Use |
|---|---|
| `results_time_split.csv`, `results_cross_region.csv` | Tables for your slides |
| `feature_importance.csv` | "What drives erosion" slide |
| `hindcast_predictions.csv` | 2023–2025 hits, misses, false alarms (map) |
| `forecast_predictions.csv` | 2026 monsoon risk per stretch (Step 10) |

---

## Step 10: Threat score per union + Bangla alerts (NEW: `06_threat_score.py`)

### What and why

The model says where land will go. The threat score adds **who is there**. Local government acts per union, so we roll stretches up to unions.

### How the score works

Per bank stretch (each part turned into a percentile 0–1 within its region, so units don't matter):

```
stretch score = 0.5 × model risk + 0.2 × recent retreat speed + 0.2 × people nearby + 0.1 × buildings nearby
```

Per union:

```
union score = 0.6 × worst stretch in the union + 0.4 × average of its stretches
```

- 70% of the stretch score is physical hazard, so an empty sandbar can't top the list, and a crowded but stable bank can't either.
- These weights are design choices. Say so in the presentation; they can be tuned with local officials.

### Before running: check the ID column names

Open `data/gaibandha/processed/training_table.csv` and `segments.gpkg` (in QGIS, Attribute Table). Find the columns holding the stretch number and the bank side. Put their names in `ID_COLS` below (e.g. `["segment", "side"]` or `["seg", "side_is_west"]`).

### The script

Save as `06_threat_score.py`:

```python
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ID_COLS = ["segment", "side"]
MODEL = Path("data/model")
UNIONS = Path("data/boundaries/geoBoundaries-BGD-ADM4.geojson")
OUT = Path("data/web")
W_RISK, W_RETREAT, W_POP, W_BLDG = 0.5, 0.2, 0.2, 0.1

ALERT_BN = (
    "সতর্কবার্তা: {union} ইউনিয়নের নদীপাড়ে আগামী বর্ষায় ভাঙনের ঝুঁকি বেশি। "
    "নদীর পাড়ের কাছে থাকা ঘরবাড়ি, গবাদিপশু ও মূল্যবান জিনিসপত্র নিরাপদ স্থানে সরানোর প্রস্তুতি নিন। "
    "বিস্তারিত জানতে ইউনিয়ন পরিষদে যোগাযোগ করুন।"
)


def segment_layer(table, keep, name):
    parts = []
    for r in table["region"].unique():
        p = Path("data") / r / "processed" / "segments.gpkg"
        if not p.exists():
            print(f"missing {p}")
            continue
        seg = gpd.read_file(p)
        keys = [c for c in ID_COLS if c in seg.columns and c in table.columns]
        if not keys:
            print(f"fix ID_COLS. segments.gpkg columns: {list(seg.columns)}")
            continue
        sub = table.loc[table["region"] == r, keys + [c for c in keep if c not in keys]]
        parts.append(seg[keys + ["geometry"]].merge(sub, on=keys).to_crs(4326))
    if parts:
        gdf = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=4326)
        gdf.to_file(OUT / f"{name}.geojson", driver="GeoJSON")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    f = pd.read_csv(MODEL / "forecast_predictions.csv")
    f["retreat_recent_m"] = f[["retreat_m_lag1", "retreat_m_lag2"]].mean(axis=1).fillna(0).clip(lower=0)
    for c in ["population", "buildings"]:
        f[c] = f[c].fillna(0)
    g = f.groupby("region")
    f["segment_score"] = (
        W_RISK * g["prob"].rank(pct=True)
        + W_RETREAT * g["retreat_recent_m"].rank(pct=True)
        + W_POP * g["population"].rank(pct=True)
        + W_BLDG * g["buildings"].rank(pct=True)
    ).round(3)

    u = (
        f.dropna(subset=["union_id"])
        .groupby(["region", "union_id", "union_name"])
        .agg(
            max_score=("segment_score", "max"),
            mean_score=("segment_score", "mean"),
            stretches=("segment_score", "size"),
            high_stretches=("risk_class", lambda s: int((s == "High").sum())),
            population=("population", "sum"),
            buildings=("buildings", "sum"),
        )
        .reset_index()
    )
    u["threat_score"] = (0.6 * u["max_score"] + 0.4 * u["mean_score"]).round(3)
    u["threat_level"] = np.where(u["threat_score"] >= 0.7, "High",
                                 np.where(u["threat_score"] >= 0.5, "Medium", "Low"))
    u = u.sort_values("threat_score", ascending=False)
    u["rank"] = range(1, len(u) + 1)
    u.to_csv(OUT / "union_ranking.csv", index=False)
    print(u[["rank", "region", "union_name", "threat_score", "threat_level", "high_stretches", "population"]]
          .head(15).to_string(index=False))

    b = gpd.read_file(UNIONS)[["shapeID", "geometry"]].rename(columns={"shapeID": "union_id"})
    b.merge(u, on="union_id").to_crs(4326).to_file(OUT / "unions.geojson", driver="GeoJSON")

    segment_layer(f, ["region", "year", "prob", "risk_class", "segment_score", "union_name"], "segments_forecast")
    h = pd.read_csv(MODEL / "hindcast_predictions.csv")
    segment_layer(h, ["region", "year", "prob", "target", "outcome"], "segments_hindcast")

    alerts = [ALERT_BN.format(union=r.union_name) for r in u[u["threat_level"] == "High"].itertuples()]
    (OUT / "alerts_bn.txt").write_text("\n\n".join(alerts), encoding="utf-8")
    print(f"\n{len(alerts)} Bangla alerts written to {OUT / 'alerts_bn.txt'}")


if __name__ == "__main__":
    main()
```

Run: `python 06_threat_score.py`

### Outputs in `data/web/`

| File | Use |
|---|---|
| `union_ranking.csv` | Ranked unions table for slides |
| `unions.geojson` | Union polygons coloured by threat (dashboard) |
| `segments_forecast.geojson` | Risk per bank stretch (dashboard) |
| `segments_hindcast.geojson` | Hits/misses/false alarms 2023–2025 (dashboard) |
| `alerts_bn.txt` | Bangla alert text for each High union |

### Voice alert prototype (free)

```
pip install gTTS
python -c "from gtts import gTTS; t = open('data/web/alerts_bn.txt', encoding='utf-8').read().split('\n\n')[0]; gTTS(t, lang='bn').save('data/web/alert_1.mp3')"
```

- Makes an MP3 of the first alert in Bangla. Play it in the demo.
- Real SMS needs a paid gateway; for the hackathon, show the text and audio only.

---

## Step 11: Map dashboard (NEW: `dashboard.html`)

### What

One HTML file with a satellite basemap and three switchable layers: union threat, 2026 risk per stretch, and hindcast results per year. Click anything to see details.

### The file

Save as `data/web/dashboard.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Char Erosion Watch</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; }
  .legend { background: #fff; padding: 8px 10px; border-radius: 6px; font: 13px sans-serif; line-height: 1.6; }
  .legend i { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: middle; }
</style>
</head>
<body>
<div id="map"></div>
<script>
const map = L.map("map").setView([24.7, 89.7], 9);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {attribution: "Esri"}).addTo(map);

const riskColor = {High: "#d7191c", Medium: "#fdae61", Low: "#1a9641"};
const outcomeColor = {hit: "#d7191c", missed: "#7b3294", false_alarm: "#fdae61", correct_quiet: "#1a9641"};
const layers = {};
const load = async f => (await fetch(f)).json();
const pct = v => v == null ? "-" : Math.round(v * 100) + "%";

(async () => {
  const unions = await load("unions.geojson");
  layers["Union threat score"] = L.geoJSON(unions, {
    style: f => ({color: "#222", weight: 1, fillColor: riskColor[f.properties.threat_level], fillOpacity: 0.35}),
    onEachFeature: (f, l) => l.bindPopup(
      `<b>${f.properties.union_name}</b><br>Rank ${f.properties.rank}<br>` +
      `Threat score ${f.properties.threat_score}<br>High-risk stretches ${f.properties.high_stretches}<br>` +
      `People near bank ${Math.round(f.properties.population || 0)}`)
  }).addTo(map);

  const fc = await load("segments_forecast.geojson");
  layers["2026 risk per stretch"] = L.geoJSON(fc, {
    style: f => ({color: riskColor[f.properties.risk_class], weight: 1, fillOpacity: 0.55}),
    onEachFeature: (f, l) => l.bindPopup(
      `${f.properties.union_name || ""} (${f.properties.region})<br>Risk ${f.properties.risk_class}<br>Model score ${pct(f.properties.prob)}`)
  }).addTo(map);

  const hc = await load("segments_hindcast.geojson");
  [...new Set(hc.features.map(f => f.properties.year))].sort().forEach(y => {
    layers[`Hindcast ${y}`] = L.geoJSON(
      {type: "FeatureCollection", features: hc.features.filter(f => f.properties.year === y)},
      {style: f => ({color: outcomeColor[f.properties.outcome], weight: 1, fillOpacity: 0.55}),
       onEachFeature: (f, l) => l.bindPopup(`Monsoon ${y}: ${f.properties.outcome}<br>Model score ${pct(f.properties.prob)}`)});
  });

  L.control.layers(null, layers, {collapsed: false}).addTo(map);
  map.fitBounds(layers["Union threat score"].getBounds());

  const legend = L.control({position: "bottomleft"});
  legend.onAdd = () => {
    const d = L.DomUtil.create("div", "legend");
    d.innerHTML = "<b>Risk</b><br>" + Object.entries(riskColor).map(([k, c]) => `<i style="background:${c}"></i>${k}`).join("<br>") +
      "<br><b>Hindcast</b><br>" + Object.entries(outcomeColor).map(([k, c]) => `<i style="background:${c}"></i>${k.replace("_", " ")}`).join("<br>");
    return d;
  };
  legend.addTo(map);
})();
</script>
</body>
</html>
```

### How to open it

Browsers block loading local GeoJSON files directly, so start a tiny local server:

```
cd data\web
python -m http.server 8000
```

Then open http://localhost:8000/dashboard.html

### Optional extras for the map

- Banklines and erosion patches: convert with `gpd.read_file("...gpkg").to_crs(4326).to_file("x.geojson", driver="GeoJSON")` and add as more layers.
- Bangla/English toggle, year slider, API (FastAPI): only if time remains.

---

## Step 12: What to show the judges

### The timing story (important)

- Today is October 2026. The 2026 monsoon is already over, and its true result can only be measured after the next dry season (Nov 2026–Apr 2027).
- So the **main proof is the hindcast**: "We trained on 2015–2022 and predicted 2023, 2024 and 2025 without seeing them. Here is what we caught and missed."
- The 2026 map is a **demonstration** of the live product.

### Suggested demo order

1. Problem: erosion maps arrive months late because clouds block optical satellites.
2. Radar idea: Sentinel-1 sees through clouds; class maps for every dry season since 2015.
3. Validation: QGIS map + Google Earth check (Step 7) + CEGIS comparison.
4. Model: results table vs baselines, cross-region test, top 3 features.
5. Hindcast map: hits, misses, false alarms per year.
6. Union ranking + dashboard + Bangla audio alert.
7. Limits and next steps (below).

### Honest limitations to state

- About 10 years of history, so results come with uncertainty.
- Settlements are detected from radar brightness and can be over-counted.
- Buildings and population are one recent snapshot.
- Threat score weights are design choices, to be agreed with local officials.

---

## Appendix A: Data sources (all free)

| Data | Where | How you get it |
|---|---|---|
| Sentinel-1 radar | Earth Engine `COPERNICUS/S1_GRD` | `02_gee_export.py` |
| Sentinel-2 optical (threshold check) | Earth Engine `COPERNICUS/S2_SR_HARMONIZED` | `01_validate_threshold.py` |
| Water history 1984–2021 | Earth Engine `JRC/GSW1_4/GlobalSurfaceWater` | `02b_gee_extras.py` |
| HAND | Earth Engine `MERIT/Hydro/v1_0_1` | `02b_gee_extras.py` |
| Dynamic World water | Earth Engine `GOOGLE/DYNAMICWORLD_V1` | `02b_gee_extras.py` |
| Buildings | Earth Engine `GOOGLE/Research/open-buildings/v3/polygons` | `02_gee_export.py` |
| Population | Earth Engine `WorldPop/GP/100m/pop` | `02_gee_export.py` |
| Upazila boundaries | geoBoundaries ADM3 (GitHub) | Manual download, Step 1.2 |
| Union boundaries | geoBoundaries ADM4 (GitHub) | Manual download, Step 1.2 |
| Historical imagery for checks | Google Earth Pro (desktop) | Free install, Step 7.2 |
| Official erosion figures | CEGIS website / news reports | Manual, Step 7.3 |
| Rainfall (optional) | Earth Engine `UCSB-CHG/CHIRPS/DAILY` | Optional |

## Appendix B: Glossary

| Word | Meaning |
|---|---|
| Dry season `y` | November of year y−1 to April of year y. The river is low, so land and water are clear |
| Monsoon `y` | The rainy season between dry season y and dry season y+1 |
| Stretch / segment | A 500 m piece of one bank |
| Feature | Something known **before** the monsoon (input) |
| Target | What happened **during** the monsoon (answer) |
| Lag | A value from an earlier year (lag1 = last year) |
| Baseline | A dumb rule the model must beat (e.g. "same as last year") |
| Hindcast | Predicting past years the model was not trained on, to prove it works |
| Recall | Share of real erosion events we caught |
| Precision | Share of our warnings that were real |
| PR-AUC | One number (0–1) summarising precision and recall together |

## Appendix C: Troubleshooting

| Problem | Fix |
|---|---|
| Export stops: "zero ascending/descending images" | Check orbits (Step 1.5); drop 2015 with `--years`; or set that orbit to `None` |
| `03_erosion.py` says grids differ | Files from two regions or two exports are mixed. Keep one region per `raw` folder and re-export the odd year |
| Banks jump to side channels or lakes | Apply guardrails (Step 8.2 A); try `CORRIDOR_CLOSING_ITER` 2 or 4; inspect `banklines.gpkg` |
| Too many red settlement pixels | Lower `PS_DISPERSION_MAX` to 0.35 or raise `PS_MEAN_DB_MIN` to −3, re-export |
| Erosion totals far above CEGIS | Threshold likely wrong; re-run Step 2 |
| `05_model.py`: very few positives | Lower `EROSION_TARGET_HA` and re-run Step 8 |
| `06_threat_score.py`: "fix ID_COLS" | Put the real segment and side column names in `ID_COLS` |
| Dashboard is blank | Open through `python -m http.server`, not by double-clicking |
| `class_weight` error in scikit-learn | `pip install -U scikit-learn` (needs 1.2 or newer) |
