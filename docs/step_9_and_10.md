# Steps 9 and 10: Model and union Threat Score

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 9 and 10.

---

## Step 9: Train and test the model (`05_model.py`)

### What was built

The doc's script, with these changes:

| Change | Why |
|---|---|
| Paths built from `config.ROOT` (`data/<region>/processed/`, `data/model/`) | Runs from any folder |
| Regions taken from `config.REGIONS` | One list of regions for the whole project |
| **Models saved** with joblib: `model_hindcast.joblib` (trained on ≤ 2022) and `model_final.joblib` (trained on all labelled years), each with its feature list | So the work can be resumed or reused without retraining |
| `run_info.json` | Features, split years, row counts of the run |

Model: scikit-learn `HistGradientBoostingClassifier` (depth 4, 200 trees, learning rate 0.05, balanced class weights), as in the doc. No hyperparameter search (doc: modest settings only).

Input: both regions' `training_table.csv` (5,962 labelled rows, 17 features). `landward_settlement_ha` and all exposure columns are **not** model inputs.

### Results

Share of stretches with major erosion (≥ 5 ha in a monsoon): Gaibandha 20.9%, Sirajganj 18.2%. Within the doc's 5–40% band, so the 5 ha target was kept.

**Time split** (train on monsoons 2015–2022 of both regions, test on 2023–2025; 1,626 test rows, 204 with major erosion):

| Model | PR-AUC | Recall @ top 20% | Precision @ top 20% |
|---|---|---|---|
| random | 0.134 | 0.191 | 0.120 |
| persistence (last year's erosion) | 0.272 | 0.422 | 0.265 |
| 3-year mean | 0.253 | 0.324 | 0.204 |
| logistic regression | 0.241 | 0.431 | 0.272 |
| **gradient boosting** | **0.282** | **0.500** | **0.315** |

- Gradient boosting is best on all three metrics. If each year we flag the riskiest 20% of stretches, we catch **half** of the real major-erosion events. Persistence catches 42% and random 19%.
- The margin over persistence is modest. Honest reading: past erosion is a strong signal; the model adds a useful amount on top of it.
- Recall 0.50 is below the doc's "solid" mark (0.6).

**Cross-region** (train one region ≤ 2022, test the other 2023–2025):

| Direction | Best model | Gradient boosting PR-AUC / recall | Persistence PR-AUC / recall |
|---|---|---|---|
| Gaibandha → Sirajganj | persistence | 0.237 / 0.341 | 0.317 / 0.492 |
| Sirajganj → Gaibandha | gradient boosting (PR-AUC), logistic (recall) | 0.267 / 0.389 | 0.204 / 0.292 |

- Training on the larger Sirajganj set transfers well to Gaibandha. Training on the small Gaibandha set (86 segments) does not beat persistence on Sirajganj. So the model needs both regions' data; more reaches would help.

**Feature importance** (drop in PR-AUC when a feature is shuffled, hindcast model):

| Rank | Feature | Plain meaning |
|---|---|---|
| 1 | `jrc_occ_land` | The land behind the bank is old riverbed (young, weak land) |
| 2 | `dw_water_river` | Open water (not sandbar) right next to the bank this dry season |
| 3 | `eroded_ha_lag1` | Erosion here last monsoon |
| 4 | `jrc_occ_river` | The channel has hugged this bank for decades |
| 5 | `bulge_m` | The bank sticks out into the river |

One-sentence explanation for the slides: *"Banks fail where the land behind them is young former riverbed, where a live channel (not a sandbar) runs right against them, and where they already eroded last year."* Two of the top three are the new Step 4 layers.

### Outputs in `data/model/`

| File | Content |
|---|---|
| `results_time_split.csv`, `results_cross_region.csv` | Tables above |
| `feature_importance.csv` | Importance per feature |
| `hindcast_predictions.csv` | 2023–2025 test rows with `prob`, `flag_top20`, `outcome` (hit / missed / false_alarm / correct_quiet) |
| `forecast_predictions.csv` | Monsoon 2026 rows (542) with `prob` and `risk_class` (High = top 10% per region, Medium = next 20%) |
| `model_hindcast.joblib`, `model_final.joblib` | Saved models |
| `run_info.json` | Run settings |

Load a saved model:

```python
import joblib, pandas as pd
m = joblib.load("data/model/model_final.joblib")
df = pd.read_csv("data/sirajganj/processed/training_table.csv")
prob = m["model"].predict_proba(df[m["features"]])[:, 1]   # after adding the 3 derived columns as in 05_model.load()
```

---

## Step 10: Threat score per union (`06_threat_score.py`)

### How the score works (as in the doc)

Per bank stretch, each part turned into a percentile (0–1) within its region:

```
stretch score = 0.5 × model risk + 0.2 × recent retreat + 0.2 × people in 2 km zone + 0.1 × buildings in 2 km zone
union score   = 0.6 × worst stretch in the union + 0.4 × average of its stretches
```

Levels: High ≥ 0.7, Medium ≥ 0.5, else Low. Weights are design choices, to be agreed with local officials.

### Changes from the doc's script

| Change | Why |
|---|---|
| Paths from `config` (`data/model`, `data/web`, `data/boundaries`) | Runs from any folder |
| Union polygons read from the `.shp`, only inside the two region boxes, and simplified | The 341 MB GeoJSON is very slow; the map does not need full detail |
| Also writes `segment_scores.csv` | Stretch scores as a table |
| Extra map layers `banklines.geojson` (every 2nd dry season) and `erosion.geojson` (monsoons 2021–2025, patches ≥ 3 ha) | Doc's "optional extras" for the map. The full erosion layer was 29 MB; the filtered one is 3.6 MB |
| Model tables copied to JSON (`results_*.json`, `feature_importance.json`) | So the dashboard can show them |
| `alerts_bn.json` next to `alerts_bn.txt` | Union name + text for the dashboard |

`ID_COLS = ["segment", "side"]` matched the columns in `training_table.csv` and `segments.gpkg` (checked).

### Results

82 unions scored (Gaibandha 25, Sirajganj 57). High: 13 (7 + 6), Medium: 49, Low: 20.

Top 10:

| Rank | Region | Union | Score | High-risk stretches | People in 2 km zones |
|---|---|---|---|---|---|
| 1 | Sirajganj | Sadia Chandpur | 0.785 | 0 | 16,458 |
| 2 | Sirajganj | Belkuchi | 0.782 | 3 | 11,145 |
| 3 | Gaibandha | Sughatta | 0.758 | 2 | 9,734 |
| 4 | Sirajganj | Kaijuri | 0.748 | 3 | 22,854 |
| 5 | Gaibandha | Bahadurabad | 0.748 | 0 | 921 |
| 6 | Sirajganj | Khas Kaulia | 0.746 | 1 | 9,524 |
| 7 | Gaibandha | Chikajani | 0.737 | 2 | 14,010 |
| 8 | Sirajganj | Khoksabari | 0.729 | 1 | 11,433 |
| 9 | Gaibandha | Ghuridaha | 0.723 | 0 | 6,328 |
| 10 | Gaibandha | Bhartkhali | 0.714 | 0 | 3,337 |

Plausibility: several match the areas named in the project notes as erosion-hit (Bharatkhali, Ghuridaha, Gazaria (rank 12) in Gaibandha; Khas Kaulia in Chauhali). Bahadurabad is on the opposite (east) bank inside the Gaibandha box. A union can rank high with 0 "High" stretches when several of its stretches are Medium-risk and densely populated.

### Bangla alerts

- `alerts_bn.txt` / `alerts_bn.json`: one alert text per High union (13).
- `alert_1.mp3`: the first alert as Bangla speech, made with gTTS (free; sends the text to Google's text-to-speech service).
- Union names come from geoBoundaries in English spelling.

### Outputs in `data/web/`

| File | Use |
|---|---|
| `union_ranking.csv` | Ranked unions |
| `unions.geojson` | Union polygons with score and level |
| `segments_forecast.geojson` | 2026 risk per stretch (2 km landward zone polygons) |
| `segments_hindcast.geojson` | 2023–2025 hits / misses / false alarms |
| `banklines.geojson`, `erosion.geojson` | Extra map layers |
| `segment_scores.csv`, `results_*.json`, `feature_importance.json` | Tables |
| `alerts_bn.txt`, `alerts_bn.json`, `alert_1.mp3` | Alerts |
