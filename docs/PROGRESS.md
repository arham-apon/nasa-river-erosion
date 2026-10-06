# Progress checkpoint (resume from here)

Project folder: `C:\Users\User\Desktop\nasa-river-erosion` (main checkout), branch `nisar-test`.
The old worktree `context-folder-review-347c4d` was removed on 2026-10-06.

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
| 13 NISAR fetch | DONE (8 passes 2026-06-18..09-22, both regions) | `08_nisar_fetch.py`, `data/nisar_scenes.csv`, `data/<region>/nisar/gcov_*.tif`, `logs/08_nisar_fetch.log` | `docs/step_13_and_14.md` |
| 14 NISAR water + 2026 erosion | DONE, PROVISIONAL (Sept river still high; re-run with Nov passes) | `09_nisar_erosion.py` → `data/<region>/nisar/*`, `logs/09_<region>.log`, `data/<region>/checks/nisar_check*.png` | `docs/step_13_and_14.md` |
| 15 Forecast check vs NISAR | DONE, PROVISIONAL | `10_nisar_check.py` → `data/model/nisar_forecast_check.csv`, `data/web/nisar_*`, `logs/10_nisar_check.log` | `docs/step_15_and_16.md` |
| 16 Dashboard NISAR section | DONE (tested in browser, desktop + phone) | `web/dashboard.html` (10 copies it to `data/web/`) | `docs/step_15_and_16.md` |

## NISAR status (2026-10-06)

- 8 passes on disk (2026-06-18 .. 09-22). L-band water threshold HH < -12.25 / -12.00 dB, balanced accuracy 0.93-0.99 per pass.
- Forecast check (provisional): 45 of 542 stretches with >= 5 ha NISAR erosion; share major High 27% / Medium 13% / Low 4%;
  gradient boosting PR-AUC 0.292, recall@20% 0.533; persistence 0.266 / 0.622; random 0.083 / 0.20.
- The river is still high on 09-22: whole-map "erosion" (3,721 / 7,488 ha) is mostly flooded char land. Use the bank-stretch numbers.
- NEXT: when October/November passes appear (36-72 h after acquisition), re-run 08 -> 09 (both regions) -> 10 and update
  the tables in docs/step_13_and_14.md and docs/step_15_and_16.md.
- run.txt is the full run guide (sections 0-8, incl. NISAR); it replaced the cut-off version on 2026-10-06.

## Notes

- Step 7/8 findings and fixes: see `docs/step_7_and_8.md`.
- Open manual task: Google Earth Pro check of `data/<region>/checks/check_<region>.kml` (doc 7.2).
- Archives (not used by the pipeline): `data/old_wide_box/` (wrong-box Drive download), `data/gaibandha_drive_-13.2dB/` (original Gaibandha class maps).
- Code, docs and the data needed to retrain are in git (branch backend-pipeline-testing); see `docs/REPRODUCE.md`. Everything else in data/ is ignored.

## Resume commands

Rebuild everything after Step 5 for one region (Git Bash):

```
export CEW_REGION=gaibandha   # or sirajganj
python 03_erosion.py && python 04_features.py && python 07_sanity_checks.py
```

Then (no region needed): `python 05_model.py`, `python 06_threat_score.py`.

Open the dashboard: `python -m http.server 8000 --directory data/web` → http://localhost:8000/dashboard.html

NISAR (needs `EARTHDATA_TOKEN` in `.env`; `.env` is git-ignored). Safe to stop and re-run; finished passes are skipped:

```
python 08_nisar_fetch.py                       # about 4-5 min per pass, both regions
CEW_REGION=gaibandha python 09_nisar_erosion.py
CEW_REGION=sirajganj python 09_nisar_erosion.py
python 10_nisar_check.py
```

Re-download inputs from Earth Engine
 (only if `data/<region>/raw` is lost):
`python 02c_fetch_direct.py class context extras` (per region; about 15–30 min each).
