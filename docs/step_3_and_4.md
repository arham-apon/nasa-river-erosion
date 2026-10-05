# Steps 3 and 4: Radar class maps and extra free layers

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 3 and 4.

---

## The main change: fetching straight from Earth Engine (no Google Drive round trip)

The doc's route is: export to Google Drive (on Google's servers), then download the Drive folder by hand. That route had three problems here:

1. **The Sirajganj Drive folder had the wrong box** (see `step_1_and_2.md`), so Sirajganj needed new exports anyway.
2. **The threshold changed to −15.0 dB** (Step 2), so the Gaibandha class maps on Drive (made at −13.2 dB) also had to be regenerated.
3. New Drive exports land in the Google Drive of the account that runs Earth Engine. I can only read the two public folder links in `links.txt`, not new files. I also tried exporting to Earth Engine **assets** instead, but the Cloud project `nasa-river-erosion` has no asset storage (`projects/nasa-river-erosion/assets` does not exist), so that failed too.

Solution: new script **`02c_fetch_direct.py`**. It builds exactly the same images (it calls the same functions as `02_gee_export.py` and `02b_gee_extras.py`) and downloads the pixels directly with `ee.data.computePixels`, in 512 × 512-pixel tiles, 8 at a time, with retries. It writes the GeoTIFFs straight into `data/<region>/raw/`.

### Same grid as a Drive export (important for `03_erosion.py`)

Earth Engine's Drive export with `crs=EPSG:32645, scale=20` uses a grid whose origin is snapped to multiples of 20 m. `region_grid()` in `02c_fetch_direct.py` reproduces this:

- x origin = floor(west / scale) × scale, y origin = ceil(north / scale) × scale (box corners converted to UTM 45N first)
- width/height = enough pixels to cover the east/south edge

Check against the Drive file for Gaibandha: Drive `class_2015.tif` is 2311 × 2152 px with origin (751460, 2814740). The formula gives exactly the same. WorldPop (100 m) also matches (463 × 431, origin 751400, 2814800).

### Test: direct fetch vs Drive export

Fetched Gaibandha `class_2021` directly (still at −13.2 dB, into a scratch folder) and compared it with the Drive file:

- same transform and shape: **True**
- pixels that agree: **100.0%** (sand/water 20.57%, land 70.03%, settlement 9.40% in both)
- time: 45 s

So the direct fetch is a drop-in replacement for "export to Drive + download".

### Usage

```
python 02c_fetch_direct.py class                # class_2015..2026.tif (Step 3)
python 02c_fetch_direct.py class --years 2023   # only some years
python 02c_fetch_direct.py context              # buildings.csv + worldpop_2020.tif (Step 3)
python 02c_fetch_direct.py extras               # static_layers.tif + dw_water_2016..2026.tif (Step 4)
```

With `CEW_REGION` set as in Step 1. `02_gee_export.py` and `02b_gee_extras.py` still work for Drive exports if someone prefers that route.

---

## Step 3: Radar class maps (per region)

### What the maps are

One GeoTIFF per dry season (Nov of year−1 to Apr of year), 20 m, EPSG:32645, values 0 = sand/water, 1 = vegetated land, 2 = settlement, 255 = no data. Made by `gee_common.class_image()`:

- land/water: mean of the ascending (orbit 114) VV images, smoothed 7 × 7, land if ≥ **−15.0 dB** (Step 2);
- settlement: stable bright scatterers (amplitude dispersion < 0.4 and mean > −4 dB) from either orbit 114 or 150.

### Changes to `02_gee_export.py` and `gee_common.py`

- `gee_common.export_image(img, name, scale)`: one shared function for Drive image exports (used by `02` and `02b`). Task names now start with the region (`gaibandha_class_2021`) so the two regions are easy to tell apart on the Tasks page.
- `02_gee_export.py`: prints region, box and threshold at the start; `buildings_fc()` and `worldpop_image()` split out so `02c` can reuse them; `wait()` shared with `02b`.

### What was done per region

| Region | Class maps | Source | Threshold |
|---|---|---|---|
| Gaibandha | 2015–2026 regenerated | `02c_fetch_direct.py class` | −15.0 dB |
| Gaibandha (archive) | 2015–2026 from Drive | `data/gaibandha_drive_-13.2dB/raw/` | −13.2 dB |
| Sirajganj | 2015–2026, new box | `02c_fetch_direct.py class` | −15.0 dB |

Time: about 1 minute per year for Gaibandha, about 2 minutes per year for Sirajganj.

`buildings.csv` and `worldpop_2020.tif`:

- Gaibandha: kept from Drive (the box is correct and neither depends on the threshold).
- Sirajganj: fetched new for the correct box.

### Problem found and fixed: building download

The doc's buildings export maps every polygon to its centroid on Google's servers. As an interactive request this fails with `User memory limit exceeded`, even for a tiny box. Fix in `02c_fetch_direct.py`: fetch the raw polygons (filtered to confidence ≥ 0.75) in 12 × 12 sub-boxes, compute centroids locally (in UTM, then back to lon/lat), and keep each building only in the sub-box that contains its centroid (no duplicates).

Test: in the area where the old wide Drive box and the new Sirajganj box overlap (89.51–89.94 E, 24.41–24.80 N), the Drive CSV and the new CSV have **exactly the same 225,041 buildings with the same total area** (15,010,487 m²).

| Region | Buildings (conf ≥ 0.75) | WorldPop 2020 people in box | WorldPop grid |
|---|---|---|---|
| Gaibandha | 232,248 | 1,524,618 | 463 × 431 at 100 m |
| Sirajganj | 604,522 | 4,663,405 | 455 × 930 at 100 m |

### Tests of the new class maps

Gaibandha, new (−15 dB) vs old (−13.2 dB), share of pixels:

| Year | sand/water new / old | land new / old | settlement new / old |
|---|---|---|---|
| 2015 | 11.4 / 16.1 | 80.1 / 75.4 | 8.5 / 8.5 |
| 2018 | 16.6 / 20.2 | 74.4 / 70.8 | 9.0 / 9.0 |
| 2021 | 17.3 / 20.6 | 73.3 / 70.0 | 9.4 / 9.4 |
| 2024 | 15.0 / 18.3 | 74.6 / 71.3 | 10.4 / 10.4 |
| 2026 | 13.8 / 16.9 | 75.7 / 72.6 | 10.5 / 10.5 |

- Settlement pixels are identical (100% agreement), as expected: the threshold only affects land/water.
- About 3–5 percentage points move from sand/water to land.
- No nodata at all; the water share stays in a steady 11–17% band across years (no sudden jumps).

Sirajganj: see the table in `step_5_and_6.md` (loaded by `03_erosion.py`).

---

## Step 4: Extra free layers

### What was added

| File | Bands | Source |
|---|---|---|
| `static_layers.tif` | `jrc_occ` (0–100, % of time water 1984–2021), `hand_m` (metres above nearest drainage) | JRC Global Surface Water 1.4, MERIT Hydro |
| `dw_water_2016.tif` … `dw_water_2026.tif` | `dw_water` (0–100 mean water probability in the dry season, 255 = no data) | Google Dynamic World V1 |

Same 20 m grid as the class maps. `static_layers.tif` uses −9999 as no data (none occurred). 2015 is skipped (Dynamic World starts mid-2015), as the doc expects.

### Changes to the doc's `02b_gee_extras.py`

- **Bug in the doc:** the Dynamic World ID is `GOOGLE/DYNAMICWORLD/V1`, not `GOOGLE/DYNAMICWORLD_V1`. With the doc's ID every Dynamic World request fails with "asset not found". Fixed.
- Uses the shared `gee_common.export_image()` and the `wait()` from `02_gee_export.py`; otherwise as in the doc.
- The files were produced with `02c_fetch_direct.py extras`, which calls `02b`'s `static_layers()`, `dw_collection()` and `dw_water()`.

### Tests

- Grid: `static_layers.tif` and `dw_water_2021.tif` have exactly the same transform and shape as `class_2021.tif`.
- Values (Gaibandha): `jrc_occ` 0–96, mean 12. `hand_m` 5th / 50th / 95th percentile = 0.0 / 0.8 / 15.0 m (a low floodplain, as expected).
- Consistency with the class map (Gaibandha 2021): mean Dynamic World water probability is 35.5 on our sand/water pixels and 9.6 on our land pixels. This also confirms the doc's point that class 0 mixes dry sand and water; `dw_water` can separate them.

### Files touched in Steps 3–4

| File | Change |
|---|---|
| `02c_fetch_direct.py` | New: direct download of class maps, context and extras on the export grid |
| `02_gee_export.py` | Region-aware task names, reusable `buildings_fc()`, `worldpop_image()`, `wait()` |
| `02b_gee_extras.py` | New (from the doc), Dynamic World ID fixed |
| `gee_common.py` | New `export_image()` |
| `logs/02c_*.log` | Fetch logs |
