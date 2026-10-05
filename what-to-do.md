# Char Erosion Watch: Data Pipeline

Builds a yearly erosion dataset and a model-ready training table for the Jamuna (Sirajganj–Gaibandha reach) from Sentinel-1 radar, following Freihardt & Frey (2023).

## 1. One-time setup (do this first; approval can take days)

1. Register for Earth Engine (non-commercial): https://code.earthengine.google.com/register
2. Create or choose a Google Cloud project with the Earth Engine API enabled: https://developers.google.com/earth-engine/guides/access
3. Install Python 3.10+ and the libraries:
   ```
   pip install -r requirements.txt
   earthengine authenticate
   ```
4. In `config.py`, set `GEE_PROJECT` to your Cloud project ID.

## 2. Validate the land/water threshold (about 10 min)

```
python 01_validate_threshold.py
```

- This compares the radar land mask against Sentinel-2 vegetation (NDVI) inside the river zone, for 2019–2026.
- If the reported best threshold differs from `LAND_THRESHOLD_DB` (−13.2 dB from the paper) by 0.5 dB or more, update `config.py`.
- If it says "no ascending images", set `ASC_ORBIT = None` in `config.py`.

## 3. Export from Earth Engine to Google Drive (1–3 hours, runs on Google's servers)

```
python 02_gee_export.py --wait
```

This exports to the Drive folder `char_erosion_watch`:

| File | Content |
|---|---|
| `class_2015.tif` … `class_2026.tif` | One file per dry season (Nov–Apr), 20 m. Values: 0 = sand/water, 1 = vegetated land, 2 = settlement, 255 = no data |
| `buildings.csv` | Google Open Buildings centroids (confidence ≥ 0.75) |
| `worldpop_2020.tif` | Population per 100 m cell |

Large files may be split into several tiles (e.g. `class_2020-0000000000-0000000000.tif`); step 4 merges them automatically.

To re-run only some years: `python 02_gee_export.py --years 2025 2026 --skip-context`

## 4. Download everything into `data/raw/`

1. Download the whole `char_erosion_watch` Drive folder and put all files in `data/raw/`.
2. Download union boundaries (geoBoundaries, admin level 4):
   https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM4/geoBoundaries-BGD-ADM4-all.zip
3. Unzip it into `data/raw/` (the script uses `geoBoundaries-BGD-ADM4.geojson`).

## 5. Build erosion layers (about 2 min)

```
python 03_erosion.py
```

Outputs in `data/processed/`:

- `class_stack.tif` — all dry seasons stacked.
- `eroded_stack.tif` — one band per monsoon (2015–2025). Values: 1 = eroded land, 2 = eroded settlement.
- `erosion_polygons.gpkg` — eroded patches with `monsoon`, `kind`, `area_ha`.
- `erosion_summary.csv` — total hectares eroded per monsoon.

## 6. Build segments, features and training table (about 2 min)

```
python 04_features.py
```

Outputs in `data/processed/`:

- **`training_table.csv`** — one row per 500 m bank segment × side (west/east) × year.
  - Features: `eroded_ha_lag1..3`, `retreat_m_lag1..2`, `eroded_settlement_ha_lag1`, `bulge_m`, `corridor_width_m`, `landward_settlement_ha`, `side_is_west`.
  - Targets: `target` (1 if ≥ 5 ha eroded that monsoon), `target_eroded_ha`, `target_retreat_m`.
  - `split`: `train` rows have known targets (monsoons 2015–2025); `forecast` rows are the 2026 monsoon to predict.
  - Exposure (current): `buildings`, `building_area_m2`, `population`, `union_name`, `union_id`.
- **`segments.gpkg`** — 2 km landward zone polygons for each segment, latest year (for the map).
- **`banklines.gpkg`** — west/east bank lines for every dry season.

Rules for modelling:

- Never use `target_*` columns as features.
- Split by year for validation (e.g. train on monsoons ≤ 2022, test on 2023–2025), not randomly.

## 7. Sanity checks before modelling

- Open `erosion_polygons.gpkg` and `banklines.gpkg` in QGIS (https://qgis.org) over a satellite basemap. Eroded patches should hug the outer banks.
- Compare `erosion_summary.csv` with CEGIS figures: recent Jamuna erosion is roughly 1,500 ha/year for the whole river. Your reach should be a fraction of that.
- If bank lines jump to side channels or floodplain lakes, shrink `AOI_BBOX` or raise `CORRIDOR_CLOSING_ITER`.

## References

- Paper: https://nhess.copernicus.org/articles/23/751/2023/
- Original Earth Engine code: https://doi.org/10.5281/zenodo.7253121 (direct: https://code.earthengine.google.com/a2a7614af421261a4b639a1abbb609c6)
- Original Earth Engine app (2015–2019): https://doi.org/10.5281/zenodo.7252970
- Video tutorial: https://doi.org/10.5281/zenodo.7249809
- CEGIS erosion prediction (validation benchmark): https://www.cegisbd.com/LandmarkProj?prjid=4
- Dataset pages:
  - https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD
  - https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED
  - https://developers.google.com/earth-engine/datasets/catalog/JRC_GSW1_4_GlobalSurfaceWater
  - https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings_v3_polygons
  - https://developers.google.com/earth-engine/datasets/catalog/WorldPop_GP_100m_pop
