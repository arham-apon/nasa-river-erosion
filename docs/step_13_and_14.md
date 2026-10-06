# Steps 13 and 14: NISAR L-band passes and the 2026 monsoon

Date: 2026-10-06. New steps (not in `char_erosion_watch_pipeline.md`): the challenge ("Dancing with the SARs") asks for NISAR data, and Steps 1–12 used Sentinel-1 only.

Plan (hybrid): Sentinel-1 (C-band) stays the 10-year training history (2015–2026 dry seasons). NISAR (L-band) maps the 2026 monsoon pass by pass and checks the 2026 forecast (Step 15).

---

## Step 13: Fetch NISAR GCOV (`08_nisar_fetch.py`)

### What NISAR data exists here

| Fact | Value |
|---|---|
| Product | NISAR L2 GCOV (geocoded, terrain-flattened backscatter gamma0), **PROVISIONAL** release, ASF DAAC |
| Pre-release BETA data over Bangladesh | none |
| Track / frame | 69 ascending, frame 14: covers 100% of both regions |
| Passes used | 8, every 12 days: 06-18, 06-30, 07-12, 07-24, 08-17, 08-29, 09-10, 09-22 (no pass between Jul 27 and Aug 10 — permanent gap in the provisional archive) |
| Polarisations | HH and HV (DHDH mode), 10 m, EPSG:32646 |
| File size | 2–9 GB per pass (HDF5, 512×512 chunks, float32, shuffle + gzip) |

### What was built

| Part | How / why |
|---|---|
| Search | `asf_search`, GCOV over the union of both region boxes, from `NISAR_START` (2026-06-01). Keeps only track 69 / ascending / frame 14 (`config.py`); one product per date (standard before urgent, latest version). Writes `data/nisar_scenes.csv` |
| Download only what is needed | The connection is ~5 MB/s, so whole files (2–9 GB × 8) are out. The script opens the HDF5 file over HTTPS, reads the chunk index, and fetches **only the chunks that overlap a region** (byte ranges, 32 in parallel), then decompresses them itself (gzip + byte shuffle) |
| Onto the Sentinel-1 grid | HH, HV and the mask are cut to each region's `class_2026.tif` box (+200 m), then averaged (in linear power) from 10 m / EPSG:32646 to the 20 m / EPSG:32645 class grid. So every NISAR pixel lines up with the Sentinel-1 maps, segments and bank lines |
| Mask | GCOV `mask`: 0 = invalid, 255 = fill, other values = valid; invalid and non-positive values become NaN |
| Output | `data/<region>/nisar/gcov_<YYYYMMDD>.tif`: band 1 `hh_db`, band 2 `hv_db` (gamma0 in dB, NaN = no data), granule name in the tags |
| Safe to stop | Each file is written as `.part.tif` and renamed only when complete; finished passes are skipped on re-run. Later passes (Oct/Nov) are picked up automatically by re-running the script (they appear 36–72 h after acquisition) |
| Token | `EARTHDATA_TOKEN` read from `.env` (git-ignored) or the environment; never printed |

### Results

- All 8 passes fetched for both regions; **100% valid pixels** in every pass and region (`logs/08_nisar_fetch.log`).
- About 3 minutes per pass for both regions together (7 passes in 21 minutes on 2026-10-06), instead of hours for full files.
- Visual check: NISAR HH and the Sentinel-1 dry-season 2026 map line up channel for channel (`data/<region>/checks/nisar_check.png`, top row).

### Outputs

| File | Content |
|---|---|
| `data/nisar_scenes.csv` | The 8 passes: date, granule, URL |
| `data/<region>/nisar/gcov_*.tif` | HH/HV dB on the 20 m class grid (31 MB Gaibandha, 67 MB Sirajganj per pass; not in git) |
| `logs/08_nisar_fetch.log` | Run log (appended on every run) |

---

## Step 14: NISAR water maps and 2026 erosion (`09_nisar_erosion.py`, per region)

### Method

1. **Speckle:** 3×3 mean in linear power (ignoring NaN).
2. **Water threshold, calibrated for L-band** (not copied from Sentinel-1's −15 dB C-band value). Reference pixels whose answer is known:
   - water: JRC surface water occurrence ≥ 75% (1984–2021) **and** water in the S-1 dry-2026 map,
   - land: JRC occurrence = 0 **and** land/settlement in S-1 dry 2026 **and** HAND ≥ 2 m (high ground that should not flood).
   Every threshold from −30 to −5 dB (0.25 dB steps) on HH and HV is tried; the one with the best balanced accuracy, pooled over all passes, is used.
3. **Water map per pass** → `water_stack.tif` (1 water, 0 not water, 255 no data).
4. **Timeline:** per pass, water area and dry-season land under water, within 3 km of the dry-season river corridor.
5. **2026 erosion** (same rules as Sentinel-1, Step 6, where they apply):
   - before = land or settlement in S-1 dry 2026 (Nov 2025–Apr 2026) **and** not water in the first NISAR pass (06-18),
   - after = water in **each of the latest 2 passes** (`NISAR_AFTER_PASSES`; one pass could be a single flood peak),
   - within 1 km of the dry-season corridor (`NISAR_MAX_RETREAT_M`), patch ≥ 1 ha, touching the corridor.
6. **Per bank stretch:** eroded hectares counted **exactly like the model's target** (see change below) next to the 2026 forecast (`prob`, `risk_class`) and last year's erosion; major = ≥ 5 ha.

### Changes and fixes while running it

| Change | Why |
|---|---|
| Only `gcov_YYYYMMDD.tif` files are read (09 and 10) | The glob `gcov_*.tif` also picked up the half-written `gcov_*.part.tif` of a running fetch |
| Empty erosion layer written correctly | `GeoDataFrame([])` with no rows crashed (no geometry column) |
| Stops with a clear message if only 1 pass is on disk | Erosion needs a before and an after |
| **Per-stretch count = training target** | The first version rasterised the 2 km stretch boxes (median bank position). The model's target (`04_features.py`) is counted row by row from the per-row bank line, 2 km landward + 60 m riverward. 09 now reuses `bank_cols`, `window_sum` and `seg_reduce` from `04_features.py`. Check: applied to the S-1 monsoon-2025 erosion it reproduces `target_eroded_ha` of the training table exactly (max difference 1e-15 ha, both sides) |

### Results

**Calibration** (`calibration.csv`): HH works better than HV in both regions.

| Region | Threshold | Reference pixels (water / land) | Balanced accuracy per pass | Median water / land |
|---|---|---|---|---|
| Gaibandha | HH < −12.25 dB | 51,171 / 728,230 | 0.925–0.985 | about −18 / −5.5 dB |
| Sirajganj | HH < −12.00 dB | 150,336 / 1,065,776 | 0.938–0.977 | about −17.5 / −4 dB |

Land is recognised correctly 97–100% of the time in every pass. Water 87–99%; the lowest is the first pass (06-18), likely wind-roughened water. Both regions independently chose almost the same threshold, a good sign the calibration is stable.

**The monsoon, pass by pass** (`timeline.csv`, within 3 km of the river; hectares):

| Pass | Gaibandha water | Gaibandha dry-season land under water | Sirajganj water | Sirajganj dry-season land under water |
|---|---|---|---|---|
| 06-18 | 36,016 | 12,495 | 56,296 | 16,080 |
| 06-30 | 46,757 | 20,919 | 74,992 | 31,734 |
| 07-12 | 38,191 | 14,147 | 61,195 | 20,195 |
| 07-24 | **52,253** | **26,063** | **92,201** | **47,836** |
| 08-17 | 37,467 | 13,106 | 67,491 | 25,851 |
| 08-29 | 42,754 | 18,016 | 75,201 | 32,541 |
| 09-10 | 45,776 | 20,138 | 80,242 | 36,537 |
| 09-22 | 41,102 | 15,657 | 71,630 | 28,149 |

Three flood pulses (end of June, late July — the largest — and early September), the same in both regions. On 09-22 the river is still far above dry-season level: 16,000 ha (Gaibandha) and 28,000 ha (Sirajganj) of dry-season land is still under water.

**2026 erosion so far** (dry season 2026 + 06-18 → water on both 09-10 and 09-22):

| Region | NISAR, whole map | of which settlement | S-1 yearly erosion 2015–2025, whole map | NISAR at bank stretches | S-1 at bank stretches 2015–2025 (2025) | Stretches ≥ 5 ha NISAR | S-1 2015–2025 (2025) |
|---|---|---|---|---|---|---|---|
| Gaibandha | 3,721 ha | 10.8 ha | 2,825–7,636 ha (mean 4,594) | 117 ha | 249–1,346 ha (263) | 8 of 172 | 13–88 (19) |
| Sirajganj | 7,488 ha | 17.9 ha | 3,141–10,231 ha (mean 6,482) | 618 ha | 399–1,951 ha (399) | 37 of 370 | 22–119 (32) |

### Honest reading

- **The radar part works.** NISAR lines up with Sentinel-1, the L-band water threshold is accurate (balanced accuracy 0.93–0.99 on every pass), and the flood pulses of the 2026 monsoon are clearly visible every 12 days through the clouds.
- **The whole-map erosion numbers are not erosion yet.** Most of the 3,700 / 7,500 ha is low char land inside the braided river belt that is still under water in September (`data/sirajganj/checks/nisar_check.png`: the speckled patches on the large char complex in the north). Sentinel-1 erosion is measured dry season to dry season, after the water has gone; NISAR's latest passes are still in high water. **The whole-map total should not be quoted as 2026 erosion.**
- **The bank-stretch numbers are more trustworthy.** The stretch windows start at the outer bank of the filled river corridor, so in-belt chars are excluded. There, 2026 so far is within or below the normal Sentinel-1 range (Gaibandha 117 ha vs. 249–1,346; Sirajganj 618 ha vs. 399–1,951). Zoomed checks show both kinds of signal:
  - Belkuchi, Sirajganj (stretches 108–111 west, all forecast High/Medium): a compact strip along the main channel's west bank — looks like real bank loss (`checks/nisar_check_zoom_seg110west.png`).
  - Khas Rajbari / Mansur Nagar, Sirajganj (stretches 13–17 east): fragmented patches on low land behind the bank — mostly flooding (`checks/nisar_check_zoom_seg15east.png`).
- **Two pieces of the season are not seen:** erosion before 06-18 (the first pass is the "before"; the river was already rising), and erosion on the falling river (Oct–Nov), which is when many banks fail.
- **Status: PROVISIONAL.** The fix is time, not a new method: when the October/November passes are out, re-run 08 → 09 → 10. The "after" then becomes the latest two passes on a low river, so flooding drops out and only land that stayed river counts — the same thing Sentinel-1 measures.

### Outputs in `data/<region>/nisar/`

| File | Content | In git |
|---|---|---|
| `calibration.csv` | Threshold, accuracy and water/land medians per pass | yes |
| `timeline.csv` | Water and dry-season land under water per pass | yes |
| `segments_2026.csv` | Per bank stretch: `nisar_eroded_ha`, `nisar_major`, forecast `prob`, `risk_class`, `eroded_ha_lag1`, union | yes |
| `erosion_2026.gpkg` | NISAR erosion polygons (land / settlement) | yes |
| `water_stack.tif` | Water map per pass | no (rebuilt) |
| `eroded_2026.tif` | 1 land eroded, 2 settlement eroded, 255 no data | no (rebuilt) |
| `logs/09_<region>.log` | Run log | – |
| `data/<region>/checks/nisar_check*.png` | Visual checks: S-1 map, NISAR HH first/last pass, water first/last pass, eroded (one-off matplotlib plots, not a pipeline step) | no |

Re-run:

```
python 08_nisar_fetch.py
set CEW_REGION=gaibandha
python 09_nisar_erosion.py
set CEW_REGION=sirajganj
python 09_nisar_erosion.py
```
