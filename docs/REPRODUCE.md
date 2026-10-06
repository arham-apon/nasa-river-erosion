# Reproduce the results on another device

The repo contains the code plus the small set of data needed to retrain the model and rebuild every result without downloading anything from Earth Engine.

## What is in git

| File | Used by | Size |
|---|---|---|
| `data/gaibandha/processed/training_table.csv`, `data/sirajganj/processed/training_table.csv` | `05_model.py` (training data) | 1.5 MB |
| `data/<region>/processed/segments.gpkg` | `06_threat_score.py` (stretch polygons) | 0.4 MB |
| `data/<region>/processed/banklines.gpkg`, `erosion_polygons.gpkg` | `06_threat_score.py` (dashboard layers) | 35 MB |
| `data/boundaries/unions_study_area.gpkg` | `06_threat_score.py` (325 unions around both regions) | 9.7 MB |
| `data/<region>/raw/class_2026.tif` | `08_nisar_fetch.py` (grid the NISAR passes are put on) | 1.1 MB |
| `data/nisar_scenes.csv`, `data/<region>/nisar/{calibration,timeline,segments_2026}.csv`, `erosion_2026.gpkg` | `10_nisar_check.py` (NISAR forecast check and dashboard layers) | 3.7 MB |

Not in git (rebuilt by the scripts): `data/model/`, `data/web/`, and the large rasters (`raw/`, `class_stack.tif`, `eroded_stack.tif`, NISAR `gcov_*.tif`, `water_stack.tif`, `eroded_2026.tif`). The full geoBoundaries file (124 MB) is over GitHub's limit; `06` made the clipped copy from it.

## Steps (Windows, cmd)

Same Python version (3.14) and exact package versions, so the model gives identical numbers:

```
py -3.14 -m venv nenv
nenv\Scripts\activate
pip install -r requirements-lock.txt
python 05_model.py
python 06_threat_score.py
python 10_nisar_check.py
python -m http.server 8000 --directory data/web
```

Open http://localhost:8000/dashboard.html.

## Check

Tested on 2026-10-06 with a clean copy holding only the files above: `results_time_split.csv`, `results_cross_region.csv`, `feature_importance.csv`, `forecast_predictions.csv`, `hindcast_predictions.csv`, `union_ranking.csv`, `segment_scores.csv` and `alerts_bn.txt` were byte-for-byte identical to the original run. Expected time-split line for gradient boosting: PR-AUC 0.282, recall@20% 0.500, precision@20% 0.315.

`10_nisar_check.py` rebuilds the NISAR forecast check and map layers from the small NISAR files in git. Without the radar images the dashboard hides the NISAR time-lapse; to get them, run the NISAR steps below.

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

## NISAR (Steps 13–15)

Needs a free NASA Earthdata account. Create a token at https://urs.earthdata.nasa.gov (Generate Token) and put it in a file `.env` in the project folder (git-ignored, never commit it):

```
EARTHDATA_TOKEN=<your token>
```

Then (about 3 minutes per pass for both regions; safe to stop and re-run):

```
python 08_nisar_fetch.py
set CEW_REGION=gaibandha
python 09_nisar_erosion.py
set CEW_REGION=sirajganj
python 09_nisar_erosion.py
python 10_nisar_check.py
```

`08` needs only `data/<region>/raw/class_2026.tif` (the grid NISAR is put on; in git), so `08` + `10` give the full dashboard, including the radar time-lapse, without Earth Engine. `09` also needs `raw/static_layers.tif`, `raw/class_*.tif` and `processed/erosion_summary.csv` (not in git): run it only after the Earth Engine steps above. Its results are already in git. New passes (October onward) are picked up automatically, so a re-run changes the provisional results (see `docs/step_15_and_16.md`). Expected with the 8 passes up to 2026-09-22: `gradient boosting forecast 0.292 0.533 0.222` in the `both` rows of `10`'s table.
