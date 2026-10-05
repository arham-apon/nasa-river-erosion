# Steps 5 and 6: Data in place and erosion maps

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 5 and 6.

---

## Step 5: Everything in the right folders

### How the files got there

| What | How |
|---|---|
| Both Drive folders from `links.txt` | Downloaded with `gdown` (public folder links, no login). Gaibandha → `data/gaibandha/raw/`; the mis-boxed "Sirajganj" folder → `data/old_wide_box/raw/` (archive) |
| Gaibandha class maps at −15 dB | `02c_fetch_direct.py class` (Drive versions at −13.2 dB moved to `data/gaibandha_drive_-13.2dB/raw/`) |
| Sirajganj class maps, buildings, WorldPop | `02c_fetch_direct.py class` and `context` |
| Extras (both regions) | `02c_fetch_direct.py extras` |
| Union + upazila boundaries | geoBoundaries ADM3/ADM4 into `data/boundaries/` (read from there by `04_features.py`, no copy needed) |

Note: Earth Engine also needed `scipy`, `gdown` (and later `scikit-learn`) installed into `nenv`.

### Final layout

```
data/
  boundaries/                     geoBoundaries-BGD-ADM3.* , geoBoundaries-BGD-ADM4.*
  gaibandha/raw/                  class_2015..2026.tif (−15 dB), dw_water_2016..2026.tif,
                                  static_layers.tif, buildings.csv, worldpop_2020.tif
  sirajganj/raw/                  same set, for the new Chauhali + Kazipur box
  gaibandha_drive_-13.2dB/raw/    archive: original Drive class maps
  old_wide_box/raw/               archive: the wrong-box "Sirajganj" Drive folder
```

### Quick check (doc's check, run on every class file)

| Region | Grid (cols × rows) | Values present | No data | Sand/water share across years |
|---|---|---|---|---|
| Gaibandha | 2311 × 2152 | 0, 1, 2 | 0.00% every year | 11.4–17.3% |
| Sirajganj | 2273 × 4642 | 0, 1, 2 | 0.00% every year | about 11–15% (land incl. settlement 85.5–88.6%) |

Healthy by the doc's rule: 0, 1, 2 all present, no 255 inside the box, no wild jumps between years. All 12 class files of a region share one grid (otherwise `03_erosion.py` would stop).

---

## Step 6: Erosion maps

### What it does (unchanged script `03_erosion.py`)

For each pair of dry seasons (y, y+1): a pixel is **eroded in monsoon y** if it was land or settlement in y and sand/water in y+1. Patches under 10 pixels (0.4 ha) are dropped. Outputs per region in `data/<region>/processed/`: `class_stack.tif`, `eroded_stack.tif`, `erosion_polygons.gpkg`, `erosion_summary.csv`.

No code changes were needed. Run:

```
set CEW_REGION=gaibandha
python 03_erosion.py
set CEW_REGION=sirajganj
python 03_erosion.py
```

### Results (eroded hectares per monsoon, whole box)

> **Update after Step 7:** these are the first-run numbers. Step 7 added two filters to `03_erosion.py` (minimum patch 1 ha, patch must touch the main river corridor), which lower the totals by about 10–15%. The current numbers are in `data/<region>/processed/erosion_summary.csv` and in `step_7_and_8.md` (section 7.3).

| Monsoon | Gaibandha total | Gaibandha settlement | Sirajganj total | Sirajganj settlement |
|---|---|---|---|---|
| 2015 | 8,576 | 43.6 | 11,679 | 148.1 |
| 2016 | 5,704 | 34.8 | 7,106 | 62.6 |
| 2017 | 5,997 | 39.4 | 7,884 | 83.3 |
| 2018 | 3,207 | 24.2 | 5,737 | 63.2 |
| 2019 | 4,543 | 33.1 | 8,475 | 73.0 |
| 2020 | 8,240 | 46.2 | 11,984 | 96.1 |
| 2021 | 3,237 | 33.0 | 4,018 | 55.0 |
| 2022 | 4,819 | 43.1 | 8,583 | 112.0 |
| 2023 | 4,593 | 33.6 | 7,022 | 91.4 |
| 2024 | 4,521 | 41.1 | 6,946 | 48.6 |
| 2025 | 3,247 | 19.2 | 3,664 | 34.2 |

Gaibandha: 20,192 erosion patches over all years; median patch 0.5 ha, 90th percentile 5 ha, 99th percentile 46 ha; patches over 10 ha hold 65% of the area.

2020 (a big flood year in Bangladesh) is high in both regions and 2021/2025 are low in both: the two regions move together, which is a good sign that this is a river signal, not noise.

### Red flag: totals are much higher than the doc's expectation

The doc (Step 7.3) expects "tens to a few hundred ha/year" per region, since CEGIS reports roughly 1,500 ha/year for the whole Jamuna. We get 3,000–12,000 ha per monsoon. I checked why:

**1. Where are the eroded pixels?** Using the JRC water-history layer from Step 4:

| Region | Share of eroded area where JRC says water ≥ 10% of the time (1984–2021) |
|---|---|
| Gaibandha | 89–98% (by year) |
| Sirajganj | 89–97% |

In Gaibandha, 98–100% of eroded area lies where the river has flowed at some time, and 0–2% on never-flooded land. So this is **not** noise from paddy fields far from the river. It is land loss inside the braided river belt: vegetated **chars** (river islands) and channel margins being cut away. That is real, but CEGIS's figure counts only erosion of the **mainland banks**. The two numbers measure different things.

**2. Is the new threshold the cause?** Re-running Step 6 on the archived −13.2 dB Gaibandha maps gives 2,390–7,365 ha per monsoon, 10–25% lower but the same order of magnitude. So the threshold is not the cause.

**Consequence for the next steps:** `04_features.py` only counts erosion within 2 km landward + 60 m riverward of the main west/east banklines, which removes most mid-channel char erosion. The comparison with CEGIS (Step 7.3) is therefore done on the bank-only numbers from Step 8, not on `erosion_summary.csv`. See `step_7_and_8.md`.

### Files

| File | Note |
|---|---|
| `03_erosion.py` | Unchanged |
| `data/<region>/processed/*` | Outputs listed above |
| `logs/03_gaibandha.log`, `logs/03_sirajganj.log` | Run output |
