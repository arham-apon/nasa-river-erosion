# Progress checkpoint (resume from here)

Project folder (work happens here, not in the main checkout):
`C:\Users\User\Desktop\nasa-river-erosion\.claude\worktrees\context-folder-review-347c4d`

Python: `C:\Users\User\Desktop\nasa-river-erosion\nenv\Scripts\python.exe` (scipy, gdown, matplotlib, scikit-learn installed).
Region switch: `CEW_REGION=gaibandha|sirajganj` (env var). Every output is on disk; nothing lives only in memory.

## Status

| Step | Status | Outputs on disk | Doc |
|---|---|---|---|
| 1 Config, two regions | DONE | `config.py`, `00_region_bbox.py`, `data/boundaries/` | `docs/step_1_and_2.md` |
| 2 Threshold check | DONE, −15.0 dB both regions | `logs/01_*.log` | `docs/step_1_and_2.md` |
| 3 Class maps | DONE (direct fetch) | `data/<region>/raw/class_*.tif`, `buildings.csv`, `worldpop_2020.tif` | `docs/step_3_and_4.md` |
| 4 Extras | DONE | `data/<region>/raw/static_layers.tif`, `dw_water_*.tif` | `docs/step_3_and_4.md` |
| 5 Data in place | DONE | `data/...` | `docs/step_5_and_6.md` |
| 6 Erosion maps | DONE | `data/<region>/processed/{class_stack,eroded_stack}.tif`, `erosion_polygons.gpkg`, `erosion_summary.csv` | `docs/step_5_and_6.md` |
| 7 Sanity checks | DONE (manual Google Earth check of KML still open) | `07_sanity_checks.py`, `data/<region>/checks/*` | `docs/step_7_and_8.md` |
| 8 Feature table | DONE | `data/<region>/processed/training_table.csv`, `segments.gpkg`, `banklines.gpkg` | `docs/step_7_and_8.md` |
| 9 Model | DONE | `05_model.py`, `data/model/*.csv`, `model_hindcast.joblib`, `model_final.joblib`, `run_info.json` | `docs/step_9_and_10.md` |
| 10 Threat score | DONE | `06_threat_score.py`, `data/web/*` (unions, segments, alerts, `alert_1.mp3`) | `docs/step_9_and_10.md` |
| 11 Dashboard | DONE | `web/dashboard.html` (copied to `data/web/`) | `docs/step_11_and_12.md` |
| 12 Judges notes | DONE | – | `docs/step_11_and_12.md` |

## Notes

- Step 7/8 findings and fixes: see `docs/step_7_and_8.md`.
- Open manual task: Google Earth Pro check of `data/<region>/checks/check_<region>.kml` (doc 7.2).
- Archives (not used by the pipeline): `data/old_wide_box/` (wrong-box Drive download), `data/gaibandha_drive_-13.2dB/` (original Gaibandha class maps).
- Code and docs are not committed to git yet; data/ is gitignored.

## Resume commands

Rebuild everything after Step 5 for one region (Git Bash):

```
export CEW_REGION=gaibandha   # or sirajganj
python 03_erosion.py && python 04_features.py && python 07_sanity_checks.py
```

Then (no region needed): `python 05_model.py`, `python 06_threat_score.py`.

Open the dashboard: `python -m http.server 8000 --directory data/web` → http://localhost:8000/dashboard.html

Re-download inputs from Earth Engine (only if `data/<region>/raw` is lost):
`python 02c_fetch_direct.py class context extras` (per region; about 15–30 min each).
