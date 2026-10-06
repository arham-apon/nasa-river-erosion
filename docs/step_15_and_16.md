# Steps 15 and 16: Checking the 2026 forecast with NISAR, and the dashboard's NISAR section

Date: 2026-10-06. New steps, following Steps 13–14 (`docs/step_13_and_14.md`).

**Everything here is PROVISIONAL**: the latest NISAR pass (2026-09-22) is still in high water. Re-run 08 → 09 → 10 with the October/November passes (statements come out around Oct 28; hackathon Nov 14–15).

---

## Step 15: Did the 2026 forecast come true? (`10_nisar_check.py`, both regions)

### What it does

- Joins both regions' `segments_2026.csv` (Step 14): per bank stretch, the model's 2026 forecast and the NISAR-observed erosion so far.
- "Major erosion" = ≥ 5 ha in the stretch window, **counted exactly like the training target** (Step 14), so the forecast is scored against what it was trained to predict.
- Scores the same way as the hindcast in Step 9: PR-AUC, and recall / precision when the riskiest 20% of stretches **in each region** are flagged.
- Compares three rankings: the gradient boosting forecast, persistence (2025 erosion) and a random ranking.
- Share of stretches with major NISAR erosion per forecast risk class (High = top 10% per region, Medium = next 20%).
- Exports dashboard files and radar quick-looks; copies `web/dashboard.html` to `data/web/`.

### Changes and fixes while running it

| Change | Why |
|---|---|
| Random baseline = **expected** score of a random ranking (PR-AUC = share of positives, recall@20% = 0.20, precision = share of positives) | The first version used one random draw. With only 8 major stretches in Gaibandha, one draw gave recall 0.375 — pure luck |
| Top 20% flagged **per region** | As in `05_model.py`; the first version pooled both regions |
| Copies `web/dashboard.html` to `data/web/` | It was described but missing; `data/web/dashboard.html` was the old version without the NISAR section |
| Quick-looks as grey + alpha PNG at 50 m (was RGBA at 40 m) | 16 frames went from 49 MB to 22 MB, so the time-lapse loads quickly |
| Only `gcov_YYYYMMDD.tif` read | Skip half-written `.part.tif` files (as in 09) |

### Results (`data/model/nisar_forecast_check.csv`)

NISAR saw major erosion (≥ 5 ha) at **45 of 542** bank stretches so far (Gaibandha 8 of 172, Sirajganj 37 of 370); 734 ha in the stretch windows.

| Scope | Ranking | PR-AUC | Recall @ top 20% | Precision @ top 20% |
|---|---|---|---|---|
| Both | **gradient boosting forecast** | **0.292** | 0.533 | 0.222 |
| Both | persistence (2025 erosion) | 0.266 | **0.622** | **0.259** |
| Both | random (expected) | 0.083 | 0.199 | 0.083 |
| Sirajganj (37 events) | gradient boosting forecast | 0.380 | 0.568 | 0.284 |
| Sirajganj | persistence | **0.463** | **0.730** | **0.365** |
| Sirajganj | random (expected) | 0.100 | 0.200 | 0.100 |
| Gaibandha (8 events) | gradient boosting forecast | **0.098** | **0.375** | **0.088** |
| Gaibandha | persistence | 0.049 | 0.125 | 0.029 |
| Gaibandha | random (expected) | 0.047 | 0.198 | 0.047 |

**Share of stretches where NISAR saw major erosion, by forecast risk class:**

| Region | High | Medium | Low |
|---|---|---|---|
| Both | **27%** (15 of 55) | 13% (14 of 108) | 4% (16 of 379) |
| Sirajganj | **38%** (14 of 37) | 15% (11 of 74) | 5% (12 of 259) |
| Gaibandha | 6% (1 of 18) | 9% (3 of 34) | 3% (4 of 120) |

Hits (High and NISAR major) include Belkuchi, Bohail, Bara Dhul, Chandan Baisha (Sirajganj) and Mohanganj (Gaibandha).

### Honest reading

- **The forecast clearly carries signal.** A stretch the model called High had major erosion **6.5 times** as often as a Low stretch (27% vs 4%). Flagging the riskiest 20% catches about half of the major-erosion stretches seen so far, against 20% for a random pick. That is the same level as the 2023–2025 hindcast (Step 9: PR-AUC 0.282, recall 0.50) — on a year the model never saw, measured by a different satellite in a different radar band.
- **It does not beat persistence this year.** Over both regions the model has the higher PR-AUC (0.29 vs 0.27) but persistence has the higher recall (0.62 vs 0.53). In Sirajganj, where most events are, persistence wins on all three numbers. This matches Step 9: the margin over "it eroded last year" is small. Say this openly.
- **Gaibandha has too few events to judge** (8 major stretches). The model does better than persistence and random there, but with 8 events this is noise either way.
- **Why the numbers can still change a lot:** (1) the "after" is September high water, so some "erosion" is flooding (Step 14: e.g. Khas Rajbari / Mansur Nagar, stretches 13–17 east, five Low/Medium "misses" that look partly flooded); (2) erosion before 06-18 and on the falling river (Oct–Nov) is missing; (3) the S-1 history had ~20% of stretches with major erosion per year, NISAR so far 8%, so many more events are likely to appear. The November re-run is the real test.

### Outputs

| File | Content |
|---|---|
| `data/model/nisar_forecast_check.csv` | Table above (scope × ranking, plus risk-class shares) |
| `data/web/nisar_forecast_check.json`, `nisar_timeline.json`, `nisar_calibration.json` | Same for the dashboard |
| `data/web/nisar_erosion.geojson` | NISAR erosion polygons, both regions, WGS84 (5.8 MB) |
| `data/web/nisar_segments.geojson` | Stretch zones with forecast, NISAR erosion and outcome: hit (High + major), missed (major, not High), not_yet (High, no major yet), quiet |
| `data/web/nisar/<region>_<date>.png`, `nisar_frames.json` | Radar quick-looks (HH, −25 to 0 dB grey, 50 m) and their map bounds |
| `logs/10_nisar_check.log` | Run log |

---

## Step 16: Dashboard NISAR section (`web/dashboard.html`)

### What was built

The NISAR block appears at the top of the side panel **only if** the NISAR files exist (otherwise the dashboard is the Step 11 version).

| Part | What it shows |
|---|---|
| **Time-lapse** (slider + Play) | The 8 NISAR HH passes over both regions, every 12 days; dark = water. Map layer "NISAR radar time-lapse" |
| **Sparkline** | Dry-season land under water per pass, one line per region: the three flood pulses |
| **"Did the 2026 forecast come true?"** | Note with the counts and risk-class shares (with the date of the latest pass and the provisional warning), and the PR-AUC / recall / precision table |
| Layer **"NISAR: land turned to water, 2026 (provisional)"** | Erosion polygons (cyan land, magenta settlement); popup says it may be erosion or flooding that has not drained yet |
| Layer **"NISAR check of the 2026 forecast"** | Stretch zones coloured hit / missed / not yet / quiet |

### Changes after testing

| Change | Why |
|---|---|
| Layer renamed from "land lost in the 2026 monsoon" to "land turned to water, 2026 (provisional)"; popup and note mention flooding | The September result is not pure erosion (Step 14) |
| Note shows the latest pass date ("By 2026-09-22, …") | Updates itself after the November re-run |
| Legend: one "Hindcast / NISAR check" block (hit, missed, false alarm / not yet, quiet) | Same colours; two blocks covered a third of the map on a phone |
| If `nisar_frames.json` is empty, the time-lapse is hidden but the forecast check still shows | A fresh clone has the small NISAR results (in git) but not the radar images |

### Browser test (2026-10-06, `python -m http.server 8000 --directory data/web`)

- Loads with no console errors; all 10 layers listed.
- Time-lapse: Play steps through the dates, both regions' frames load and line up with the satellite basemap and the stretch zones (checked zoomed in at Belkuchi).
- Forecast-check layer and popups work; table and note filled.
- Phone width (375 px): map on top, panel below, legend readable.
- No-frames case (empty `nisar_frames.json`): time-lapse hidden, rest works.

---

## What to tell the judges about NISAR

- **Where NISAR is used:** NISAR L-band radar maps the 2026 monsoon every 12 days, through the clouds, from the first passes over Bangladesh (June 18) — and checks our 2026 erosion forecast weeks after the erosion happens, instead of waiting for cloud-free optical images after the monsoon.
- **Why both satellites:** NISAR only started covering Bangladesh in June 2026, so it cannot give a 10-year history. Sentinel-1 gives the history to learn from (2015–2026); NISAR gives the current season. The method carries over: when NISAR has a few dry seasons, the whole pipeline can run on it.
- **How we used it properly:** we did not copy Sentinel-1's water threshold; we calibrated L-band on pixels that 38 years of Landsat (JRC) say are always water or never water: 93–99% balanced accuracy on every pass. We download only the 512×512 chunks of the 2–9 GB files that cover our river, about 3 minutes per pass.
- **Result so far:** stretches we called High risk lost ≥ 5 ha of land 27% of the time, Low-risk stretches 4% (Sirajganj: 38% vs 5%). Flagging the top 20% catches about half of the events — as good as our 2023–2025 hindcast.
- **Being honest:** "erosion happens where it happened last year" is about as good a predictor this year; the river is still high in September, so part of what NISAR sees is flooding; and the result is provisional until the November passes.

## Re-run with later passes

```
python 08_nisar_fetch.py
set CEW_REGION=gaibandha
python 09_nisar_erosion.py
set CEW_REGION=sirajganj
python 09_nisar_erosion.py
python 10_nisar_check.py
```

Then update the tables in this doc and in `docs/step_13_and_14.md`.
