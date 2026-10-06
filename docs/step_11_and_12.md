# Steps 11 and 12: Map dashboard and what to show the judges

Date: 2026-10-06. Follows `char_erosion_watch_pipeline.md`, Steps 11 and 12.

---

## Step 11: Map dashboard

### Where it lives

- Source (kept in the repo): `web/dashboard.html`.
- `06_threat_score.py` copies it into `data/web/` next to the GeoJSON files it reads (the doc saved it straight into `data/web/`, but `data/` is not in git).

### How to open it

Browsers block reading local GeoJSON files from a double-clicked HTML file, so serve the folder:

```
python -m http.server 8000 --directory data/web
```

Then open http://localhost:8000/dashboard.html. (`.claude/launch.json` has the same server on port 8765 for the Claude browser pane.)

### What is on it

Built on the doc's Leaflet page (satellite basemap, three switchable layers), plus a side panel and two extra layers:

| Part | Content |
|---|---|
| Layer "Union threat score" (on) | Union polygons coloured High / Medium / Low; popup: rank, score, high-risk stretches, people and buildings within 2 km of the bank |
| Layer "2026 risk per stretch" (on) | 2 km landward zone of every 500 m stretch, coloured by `risk_class`; popup: model score and stretch threat score |
| Layers "Hindcast 2023 / 2024 / 2025" | Each stretch coloured hit / missed / false alarm / correct quiet; popup: model score and hectares really eroded |
| Layer "Banklines (every 2nd year)" (new) | West (red) and east (green) bank lines, older years fainter |
| Layer "Eroded land 2021–2025" (new) | Radar erosion patches ≥ 3 ha, yellow = land, magenta = settlement |
| Side panel (new) | Top 15 unions (click → zoom and popup), model results table, top 5 drivers in plain words, Bangla alerts with the audio player (`alert_1.mp3`) |
| Legend | Risk/threat colours and hindcast colours |

Design details: all text from data is HTML-escaped; the layer list collapses on narrow screens; on phones the side panel moves below the map.

### Test (in the Claude browser pane)

- Page loads with no console errors; union and stretch layers draw over both regions; side panel shows 15 unions, the results table (gradient boosting in bold), 5 drivers and 13 alerts.
- Switching layers: the union and stretch layers off, then Hindcast 2025 and the erosion layer on. Both draw correctly.
- Clicking a union row zooms to it and opens its popup. Fixed during testing: if the union layer was switched off, the click now switches it back on first.

---

## Step 12: What to show the judges

### The timing story

- Today is October 2026. The 2026 monsoon is over, but its result can only be measured from the next dry season (Nov 2026–Apr 2027). So the 2026 map is a **demonstration** of the live product.
- The **proof is the hindcast**: "We trained on monsoons 2015–2022 and predicted 2023, 2024 and 2025 without seeing them."

### Suggested demo order, with our numbers

1. **Problem.** Erosion maps arrive months late because clouds block optical satellites in the monsoon.
2. **Radar idea.** Sentinel-1 sees through clouds. We made land / sand-water / settlement maps for every dry season 2015–2026 for two Jamuna reaches (Gaibandha 2311 × 2152 px, Sirajganj 2273 × 4642 px, 20 m).
3. **Calibration and validation.**
   - Land/water threshold tuned per region against Sentinel-2: the best cut-off is −15.0 dB in both regions, with balanced accuracy 0.93–0.95. The paper's −13.2 dB gives 0.90–0.92.
   - Optical check of erosion patches: patches over 10 ha are 80–93% confirmed. After the radar-only filters (≥ 1 ha, touching the main channel), Gaibandha passes the 15-of-20 rule (16/20); Sirajganj gets 13/20.
   - Bank erosion near the main banks is 250–675 ha/yr (Gaibandha) and 400–1,900 ha/yr (Sirajganj), the same order as CEGIS's ~1,500 ha/yr for the whole Jamuna. Erosion inside the braided belt (chars) is about 5–10× larger and is not what CEGIS counts.
4. **Model.**
   - Gradient boosting beats random, "same as last year", 3-year mean and logistic regression on unseen years: PR-AUC 0.28 vs 0.27 (persistence) vs 0.13 (random).
   - Flagging the riskiest 20% of stretches catches 50% of major-erosion events (persistence 42%, random 19%).
   - Cross-region: training on Sirajganj predicts Gaibandha better than all baselines. The reverse direction does not beat persistence (Gaibandha alone is too small).
   - Top drivers: old riverbed behind the bank, open water right at the bank, erosion last year.
5. **Hindcast map.** Dashboard layers Hindcast 2023/2024/2025: hits, misses, false alarms.
6. **Union ranking and alerts.** 82 unions scored, 13 High (e.g. Sadia Chandpur, Belkuchi, Sughatta, Kaijuri, Khas Kaulia, Bharatkhali, Gazaria). Play `alert_1.mp3` (Bangla).
7. **Limits and next steps** (below).

### Honest limitations to state

- About 10 years of history (11 monsoons); neighbouring stretches are correlated, so the results come with uncertainty.
- The model's gain over "same as last year" is real but modest (recall 0.50 vs 0.42).
- Radar erosion maps include char erosion inside the river; small patches are unreliable (filtered at 1 ha). The Sirajganj optical check (13/20) is below the doc's rule; the manual Google Earth check (`data/<region>/checks/check_<region>.kml`) is still to do.
- Settlements are detected from radar brightness (8–10% of the area) and may be over-counted.
- Buildings (Open Buildings v3) and population (WorldPop 2020) are one snapshot.
- Bank tracing works per image row (north–south rivers only). A few kinks remain at tributary mouths and the Bangabandhu Bridge guide bunds; the 1 km max-jump rule removes those moves.
- Threat score weights (0.5 / 0.2 / 0.2 / 0.1 and 0.6 / 0.4) are design choices, to be agreed with local officials.
- Union names are in English spelling (geoBoundaries); Bangla names would need a lookup table.

### Next steps (after the hackathon)

1. Manual Google Earth check of the 20 patches per region; adjust the filters if needed.
2. Add more reaches (Kurigram, Padma sites) to give the model more data; the Padma needs transect-based banks (not north–south).
3. When dry season 2027 (`class_2027`) is available (May 2027), score the 2026 forecast for real.
4. API (e.g. FastAPI serving `data/web/*.json`), Bangla/English toggle, SMS gateway.

---

## Files touched in Steps 11–12

| File | Change |
|---|---|
| `web/dashboard.html` | New dashboard |
| `06_threat_score.py` | Copies the dashboard into `data/web/` |
| `.claude/launch.json` | Local server config for the Claude browser pane |
| `requirements.txt` | Added gdown, matplotlib, joblib, gTTS |
