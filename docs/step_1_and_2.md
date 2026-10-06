# Steps 1 and 2: Two-region config and land/water threshold check

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 1 and 2.

---

## Step 1: Set up two regions

### 1.0 What I found first (important)

Before changing anything I listed and downloaded both Google Drive folders from `links.txt`, and checked where each file actually lies on the map.

| Drive folder (from `links.txt`) | Expected box | Actual extent of the files | Verdict |
|---|---|---|---|
| Shaghata + Fulchhari, Gaibandha | `[89.50, 25.04, 89.95, 25.42]` | 89.492–89.959 E, 25.032–25.428 N, grid 2311 × 2152 px at 20 m | Correct |
| Chauhali + Kazipur, Sirajganj | Chauhali + Kazipur | 89.432–89.972 E, 24.391–25.309 N, grid 2628 × 5037 px | **Wrong box** |

The "Sirajganj" folder contains the **old wide box** `[89.45, 24.40, 89.95, 25.30]`. The pipeline doc (section 0.1) explicitly says not to use this box: it overlaps Gaibandha and misses most of Chauhali, which reaches south to 24.01 N. Its `buildings.csv` has the same old extent.

What I did with it: moved those files to `data/old_wide_box/raw/` (kept for reference, never used by the pipeline). Sirajganj is fetched fresh for the correct box (see Steps 3 and 4).

### 1.1 Folder layout

Created inside the project:

```
data/
  boundaries/          geoBoundaries ADM3 (upazila) + ADM4 (union) for Bangladesh
  gaibandha/raw/       Gaibandha inputs
  sirajganj/raw/       Sirajganj inputs
  old_wide_box/raw/    the mis-boxed "Sirajganj" Drive download (archive only)
  gaibandha_drive_-13.2dB/raw/   the original Gaibandha class maps (archive; see Step 2)
```

`data/`, `nenv/` and `__pycache__/` were added to `.gitignore` (data is large and re-creatable).

### 1.2 Sirajganj box from official boundaries

- Downloaded geoBoundaries ADM3 and ADM4 for Bangladesh (GitHub, `gbOpen/BGD`) and unzipped them into `data/boundaries/`.
- Wrote `00_region_bbox.py` (from the doc, small changes):
  - Takes upazila name fragments on the command line (default `chauhali chowhali kazipur`).
  - Reads the `.shp` (much faster than the 125 MB `.geojson`) from `config.BOUNDARIES`.
  - Prints the matched names, the raw upazila bounds, and the padded box (0.03° on each side, 0.12° extra on the east so the whole river and the far bank are inside).

Result:

```
Matched: ['Chauhali', 'Kazipur']
Upazila bounds: [89.545, 24.014, 89.825, 24.784]
Box: [89.51, 23.98, 89.94, 24.81]
```

The doc's fallback box was `[89.55, 24.00, 89.95, 24.85]`. The computed box is better: its west edge (89.51) leaves 3 km of land west of Kazipur's west edge (89.545); the fallback's west edge (89.55) would cut the upazila off.

**Union boundary file.** The doc says to copy the 341 MB `geoBoundaries-BGD-ADM4.geojson` into each `raw/` folder. Instead, I changed `load_unions()` in `04_features.py` to also look in `data/boundaries/`, prefer the `.shp`, and read only features inside the region box (`bbox=`). Test: Gaibandha loads 89 unions, Sirajganj 199, in a few seconds.

### 1.3 `config.py` rewritten for two regions

- Removed the single-box settings (`AOI_BBOX`, `DRIVE_FOLDER`, `LAND_THRESHOLD_DB`, `ASC_ORBIT`, `DESC_ORBIT`) and the duplicated `LAST_DRY_SEASON`.
- Added the `REGIONS` dictionary and `REGION = os.environ.get("CEW_REGION", "gaibandha")`. An unknown region name stops with a clear message.

| Region | Box | Drive folder | Threshold | Orbits asc/desc |
|---|---|---|---|---|
| `gaibandha` | `[89.50, 25.04, 89.95, 25.42]` | `erosion_Shaghata_and_Fulchhari_Gaibandha` | −15.0 dB (Step 2) | 114 / 150 |
| `sirajganj` | `[89.51, 23.98, 89.94, 24.81]` | `erosion_Chauhali_and_Kazipur_Sirajganj` | −15.0 dB (Step 2) | 114 / 150 |

- `DATA` is now `data/<region>` (or `CEW_DATA` if set). `RAW` and `PROCESSED` follow from it.
- New `BOUNDARIES = data/boundaries` (shared by both regions).

How to switch region:

| Terminal | Command |
|---|---|
| cmd | `set CEW_REGION=sirajganj` |
| PowerShell | `$env:CEW_REGION = "sirajganj"` |
| Git Bash | `CEW_REGION=sirajganj python script.py` |

Test: `python -c "import config; print(config.REGION, config.AOI_BBOX, config.RAW)"` prints the right box and `data\gaibandha\raw` (default) or `data\sirajganj\raw`.

### 1.4 Orbit check for Sirajganj (doc 1.5)

Ran an Earth Engine query for the new box: Sentinel-1 IW images per pass and orbit, per dry season.

| Dry season | Ascending 114 | Ascending 12 | Descending 150 |
|---|---|---|---|
| 2015 | 14 | – | 7 |
| 2016 | 7 | – | 4 |
| 2020 | 15 | 15 | 15 |
| 2025 | 16 | 15 | 14 |
| 2026 | 14 | 16 | 30 |

- Orbit 12 (ascending) only exists from about 2017 onward, so it cannot give a consistent 2015–2026 series. Orbit 114 is present every year.
- **Every pixel** of the box is covered: minimum images per pixel = 7 (2015) and 14–15 (2026) for both 114 and 150.
- Decision: keep 114 / 150 for Sirajganj, same as Gaibandha. No need for `None`.

Box check (instead of the visual check in the Code Editor): share of JRC "water more than 50% of the time" in a 2 km strip along each edge: west 0.6%, east 0.3%. So the river channel does not touch either side; the whole river is inside the box.

---

## Step 2: Land/water threshold check

### What it does

`01_validate_threshold.py` takes 8,000 random points inside the region, keeps those that were ever water (JRC occurrence > 0, i.e. the river zone), and for each dry season 2019–2026 compares:

- radar "land" (smoothed ascending VV ≥ threshold) for a range of thresholds, with
- optical vegetation from Sentinel-2 (90th-percentile NDVI over the season > 0.1).

### First run (original script) and why I did not trust it

| Region | Best | Accuracy at best | Accuracy at −13.2 |
|---|---|---|---|
| Gaibandha | −15.0 dB | 0.921 | 0.864 |
| Sirajganj | −15.0 dB | 0.939 | 0.887 |

Problem: −15.0 was the **lowest threshold tested**, and accuracy rose steadily toward it. So the true optimum might be even lower, outside the tested range. Also, plain accuracy is biased: 64–79% of sample points are vegetated, so simply calling more pixels "land" inflates accuracy without separating sand from land any better.

### Changes to `01_validate_threshold.py` and `config.py`

- `VALIDATION_THRESHOLDS` extended down to −18 dB: `[-18, -17, -16.5, -16, -15.5, -15, -14.5, -14, -13.5, -13.2, -13, -12.5, -12, -11]`.
- New `scores()` computes **balanced accuracy** = mean of (share of vegetated points called land) and (share of bare/water points called sand/water). This is not inflated by the class imbalance.
- Each line now also prints the vegetated share; the best threshold is chosen by balanced accuracy. The region and box are printed at the top.

### Second run (results)

Mean over 8 dry seasons, accuracy / balanced accuracy:

| Threshold | Gaibandha | Sirajganj |
|---|---|---|
| −18.0 | 0.880 / 0.824 | 0.924 / 0.854 |
| −17.0 | 0.909 / 0.877 | 0.939 / 0.899 |
| −16.0 | 0.926 / 0.917 | 0.945 / 0.933 |
| −15.5 | 0.926 / 0.927 | 0.944 / 0.943 |
| **−15.0** | 0.921 / **0.931** | 0.939 / **0.947** |
| −14.5 | 0.911 / 0.928 | 0.929 / 0.946 |
| −14.0 | 0.896 / 0.919 | 0.917 / 0.941 |
| −13.2 (old) | 0.864 / 0.899 | 0.887 / 0.924 |
| −12.0 | 0.803 / 0.854 | 0.814 / 0.878 |
| −11.0 | 0.685 / 0.767 | 0.651 / 0.773 |

- Balanced accuracy now peaks **inside** the range at −15.0 dB in both regions and falls on both sides. That is a real optimum.
- The peak is consistent across years: in every single season the best value is between −15.5 and −14.5 dB.
- Sample sizes: 3,200 points per season (Gaibandha), 3,597 (Sirajganj). Ascending images per season: about 30 (Gaibandha, two frames) and 14–16 (Sirajganj).

### Decision

−15.0 differs from −13.2 by 1.8 dB (rule: update if ≥ 0.5 dB), so `threshold_db = -15.0` for **both** regions in `config.py`.

Consequence: the Gaibandha class maps already on Drive were made with −13.2 dB. They were moved to `data/gaibandha_drive_-13.2dB/raw/` (archive) and Gaibandha's class maps are regenerated in Step 3 with −15.0. Only the land/water split changes; settlement detection does not use this threshold.

Caveat: the reference is NDVI > 0.1, so "land" here means vegetated land. Bare but stable land (for example, a harvested field in the dry season) counts as non-vegetated in the reference. The −15 dB value is the best match to vegetation, which is the definition of land used in the paper.

### Files touched in Steps 1–2

| File | Change |
|---|---|
| `config.py` | Two regions, `CEW_REGION`, per-region data folders, `BOUNDARIES`, threshold −15.0, wider validation range |
| `00_region_bbox.py` | New |
| `01_validate_threshold.py` | Balanced accuracy, vegetated share, region header |
| `04_features.py` | `load_unions()` also reads `data/boundaries/`, prefers `.shp`, reads only the region box |
| `.gitignore` | Ignores `data/`, `nenv/`, `__pycache__/` |
| `logs/01_gaibandha.log`, `logs/01_sirajganj.log` | Full threshold output |
