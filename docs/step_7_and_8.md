# Steps 7 and 8: Sanity checks and the feature table

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 7 and 8. Steps 7 and 8 were done together and repeated: the checks found problems, the fixes went into `03_erosion.py` and `04_features.py`, and the checks were re-run.

---

## Step 7: Sanity checks

The doc's checks are manual (QGIS, Google Earth Pro, CEGIS). I automated what can be automated in a new script **`07_sanity_checks.py`** (run per region). It also prepares the manual checks.

| Output in `data/<region>/checks/` | Doc step | What it is |
|---|---|---|
| `quicklook_2018/2020/2024.png` | 7.1 | Class map (blue sand/water, green land, red settlement) beside that monsoon's erosion |
| `banklines.png` | 7.1 | West (red) and east (green) bank lines over the water mask for 2018/2020/2024 |
| `check_<region>.kml` | 7.2 | 20 random erosion patches > 2 ha, for Google Earth Pro with historical imagery (manual check still to do) |
| `optical_check.csv` | 7.2, automated | The same 20 patches checked with Sentinel-2: share vegetated in the dry season before and after |
| `optical_check_by_size.csv` | 7.2, extended | 110 patches per region, stratified by size (made during the investigation below) |
| `bank_erosion_summary.csv` | 7.3 | Erosion near the main banks per monsoon, compared with the whole box |

**Automated optical check.** A patch is "confirmed" if Sentinel-2 calls ≥ 50% of it vegetated (90th-percentile NDVI > 0.1) in the dry season before the monsoon and < 50% after. Sentinel-2 surface reflectance starts in 2017, so only monsoons 2018–2025 are sampled. This is the automated stand-in for "15 of 20 real in Google Earth".

### 7.1 Visual check

- Class maps look right: the braided Jamuna belt with chars, Bangabandhu Bridge visible in Sirajganj, towns (Sirajganj, Gaibandha side) as red clusters, small rivers in blue.
- Erosion hugs the channel margins and char edges, as expected.

### 7.2 First optical check: failed

| Region | Confirmed (of 20) | By area |
|---|---|---|
| Gaibandha | 13 | 77% |
| Sirajganj | 8 | 79% |

The doc's rule is 15 or more of 20. By area most erosion was confirmed, so I checked 110 patches per region, by size:

| Patch size | Gaibandha confirmed | Sirajganj confirmed |
|---|---|---|
| 0.4–2 ha | 32% | 24% |
| 2–10 ha | 62% | 31% |
| > 10 ha | 93% | 80% |

Two more tests on the same 110 patches per region:

| Test | Gaibandha | Sirajganj | Used? |
|---|---|---|---|
| Patch does **not** touch the main river corridor of the year before | 17% confirmed (6 patches) | 21% (29 patches) | **Yes**: such patches are mostly false |
| Patch stays sand/water also in the dry season after next (persistence) | 59% vs 65% without | 49% vs 32% | No: no clear gain, and it would cost the newest year |

Patches under 1 ha are 68% (Gaibandha) / 75% (Sirajganj) of all patches but only 6.7% / 8.6% of the eroded area.

### Fixes made (radar-only, so the method still works without optical data)

| Where | Change |
|---|---|
| `config.py` | `MIN_PATCH_PX` 10 → **25** (0.4 ha → 1 ha); new `EROSION_TOUCH_CORRIDOR = True` |
| `03_erosion.py` | New `touching()`: keep only eroded patches within 2 pixels of the main river corridor of the dry season before (corridor from `04_features.corridor`) |
| `config.py`, `04_features.py` | New `CORRIDOR_OPENING_ITER = 5`: after filling the corridor's holes, a morphological opening removes arms narrower than ~220 m. Without it, tributaries joining from the west in Sirajganj became part of the "main corridor" and the west bank jumped kilometres sideways (see below) |

### After the fixes

| Region | Optical check (of 20) | Doc rule (≥ 15) |
|---|---|---|
| Gaibandha | **16** | Pass |
| Sirajganj | **13** | Close, below the rule |

Remaining Sirajganj failures are mostly "vegetated before and after". Two causes are likely. (1) Radar errors on flooded or very wet fields. (2) A weakness of the optical reference: newly deposited sand is colonised by grass within the same dry season, so the greenest moment of the season can look "vegetated" even though the land really was eroded. **Still to do by hand:** open `check_sirajganj.kml` in Google Earth Pro (doc 7.2) to settle this.

### 7.3 Comparison with official numbers

`bank_erosion_summary.csv`: erosion within 2 km landward + 60 m riverward of the main west/east banks (the part `04_features.py` uses), against the whole box.

| Monsoon | Gaibandha bank ha | Sirajganj bank ha | Gaibandha box ha | Sirajganj box ha |
|---|---|---|---|---|
| 2015 | 1,346 | 1,951 | 7,636 | 10,231 |
| 2016 | 591 | 1,049 | 5,226 | 6,249 |
| 2017 | 519 | 1,277 | 5,257 | 6,631 |
| 2018 | 351 | 761 | 2,849 | 4,985 |
| 2019 | 451 | 1,109 | 3,833 | 7,061 |
| 2020 | 675 | 1,878 | 7,539 | 10,133 |
| 2021 | 249 | 408 | 2,945 | 3,348 |
| 2022 | 358 | 1,513 | 4,356 | 7,425 |
| 2023 | 337 | 867 | 4,030 | 6,087 |
| 2024 | 424 | 722 | 4,035 | 6,012 |
| 2025 | 263 | 399 | 2,825 | 3,141 |

- Only 10–20% of the box erosion is at the main banks; the rest is char erosion inside the river belt.
- Bank erosion in Gaibandha (250–675 ha/yr after 2015) and Sirajganj (400–1,900 ha/yr) is now the same order as CEGIS's roughly 1,500 ha/yr for the whole Jamuna. It is somewhat high: the 2 km landward window also catches land behind side channels. Gaibandha 2015 (1,346 ha) is an outlier, probably because the 2015 dry season had fewer images (water share 11.4% vs 14–17% later).
- CEGIS PDFs could not be fetched automatically. For the slides, quote CEGIS or newspaper figures for these upazilas next to this table.

---

## Step 8: Feature table

### 8.1 First run

The unchanged script ran fine. Problems found:

| Problem | Evidence | Fix |
|---|---|---|
| Sirajganj west bank jumping into tributaries | `banklines.png`; 683 of 4,070 bank moves > 1 km | Corridor opening (above); now 258 |
| `split` wrong | Any earlier-year row whose bank was not traced got `split = forecast` | `split = forecast` only for the latest year (2026), else `train`; `05_model.py` drops rows with no target |
| Gaibandha population mostly empty (34% filled) | Drive WorldPop uses NaN for no data; one NaN cell made a zone's sum NaN | `worldpop_sum` ignores NaN and negative cells; now 100% filled |
| `bulge_m` sign inverted vs the doc | Code: positive = bank set back; doc: positive = sticks out into the river | Sign flipped so positive = sticks out (west: larger x, east: smaller x) |

### 8.2 Changes from the doc

**A. Guardrails on bank lines**

- `smooth_cols()`: rolling median of the bank column over 11 rows (220 m); rows without a bank stay empty.
- Max-jump rule: `target_retreat_m` with |value| > 1,000 m is set to empty (and so are the lag features made from it). Removed: Gaibandha 99 of 1,892, Sirajganj 258 of 4,070.

**B. New features from Step 4** (per row: median over a 500 m (25-pixel) strip next to the bank; then median per 500 m segment)

| Column | Layer | Strip |
|---|---|---|
| `jrc_occ_river` | JRC occurrence | riverward |
| `jrc_occ_land` | JRC occurrence | landward |
| `hand_land_m` | MERIT HAND | landward |
| `dw_water_river` | Dynamic World water of the same dry season (row year y uses `dw_water_y`, before monsoon y: no leakage) | riverward |
| `dw_water_change` | `dw_water_river` this year minus last year | – |

Layers are loaded with the doc's `load_on_grid()` (nearest-neighbour onto the class grid; here the grids are already identical).

### 8.3 Result

| | Gaibandha | Sirajganj |
|---|---|---|
| Segments (500 m) × sides | 86 × 2 | 185 × 2 |
| Training rows (monsoons 2015–2025) | 1,892 | 4,070 |
| Forecast rows (monsoon 2026) | 172 | 370 |
| Share with major erosion (`target` = ≥ 5 ha) | 20.9% | 18.2% |
| Unions linked | 25 | 57 |
| People in 2 km landward zones (2026) | 154,765 | 515,014 |
| Buildings in those zones | 29,023 | 72,517 |

The erosion share is inside the doc's healthy range (5–40%), so `EROSION_TARGET_HA = 5` stays.

Feature coverage on training rows: Step 4 static features 100%; `dw_water_river` 91% (no Dynamic World for 2015); `dw_water_change` 82%; lag features 85–91% (first years have no history). Simple correlations with `target_eroded_ha`: `eroded_ha_lag1` 0.13 / 0.21, `bulge_m` 0.14 / 0.10 (Gaibandha / Sirajganj).

Outputs per region in `data/<region>/processed/`: `training_table.csv`, `segments.gpkg` (2 km landward zones, 2026), `banklines.gpkg`.

### Files touched in Steps 7–8

| File | Change |
|---|---|
| `07_sanity_checks.py` | New |
| `03_erosion.py` | `touching()` corridor filter |
| `04_features.py` | Guardrails, new features, corridor opening, split fix, WorldPop fix, bulge sign |
| `config.py` | `MIN_PATCH_PX = 25`, `EROSION_TOUCH_CORRIDOR`, `CORRIDOR_OPENING_ITER = 5` |
| `logs/03_*`, `logs/04_*`, `logs/07_*` | Run output |
