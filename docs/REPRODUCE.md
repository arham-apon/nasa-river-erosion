# Reproduce the results on another device

The repo contains the code plus the small set of data needed to retrain the model and rebuild every result without downloading anything from Earth Engine.

## What is in git

| File | Used by | Size |
|---|---|---|
| `data/gaibandha/processed/training_table.csv`, `data/sirajganj/processed/training_table.csv` | `05_model.py` (training data) | 1.5 MB |
| `data/<region>/processed/segments.gpkg` | `06_threat_score.py` (stretch polygons) | 0.4 MB |
| `data/<region>/processed/banklines.gpkg`, `erosion_polygons.gpkg` | `06_threat_score.py` (dashboard layers) | 35 MB |
| `data/boundaries/unions_study_area.gpkg` | `06_threat_score.py` (325 unions around both regions) | 9.7 MB |

Not in git (rebuilt by the scripts): `data/model/`, `data/web/`, and the large rasters (`raw/`, `class_stack.tif`, `eroded_stack.tif`). The full geoBoundaries file (124 MB) is over GitHub's limit; `06` made the clipped copy from it.

## Steps (Windows, cmd)

Same Python version (3.14) and exact package versions, so the model gives identical numbers:

```
py -3.14 -m venv nenv
nenv\Scripts\activate
pip install -r requirements-lock.txt
python 05_model.py
python 06_threat_score.py
python -m http.server 8000 --directory data/web
```

Open http://localhost:8000/dashboard.html.

## Check

Tested on 2026-10-06 with a clean copy holding only the files above: `results_time_split.csv`, `results_cross_region.csv`, `feature_importance.csv`, `forecast_predictions.csv`, `hindcast_predictions.csv`, `union_ranking.csv`, `segment_scores.csv` and `alerts_bn.txt` were byte-for-byte identical to the original run. Expected time-split line for gradient boosting: PR-AUC 0.282, recall@20% 0.500, precision@20% 0.315.

`alert_1.mp3` (optional voice alert) needs `pip install gTTS` and internet; see `docs/step_9_and_10.md`.

## To rebuild everything from scratch (Steps 1–8)

Needs Earth Engine access (`earthengine authenticate`, project `nasa-river-erosion`) and the geoBoundaries ADM3/ADM4 files in `data/boundaries/`. Per region:

```
set CEW_REGION=gaibandha
python 02c_fetch_direct.py class context extras
python 03_erosion.py
python 04_features.py
python 07_sanity_checks.py
```

Then repeat with `set CEW_REGION=sirajganj`. Note: Earth Engine collections can gain or lose scenes over time, so a full rebuild may differ slightly from the stored training tables.
