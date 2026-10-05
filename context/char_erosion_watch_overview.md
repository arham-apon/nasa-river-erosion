# Char Erosion Watch

**NASA Space Apps Challenge 2026 — Dancing with the SARs**

## 1. The problem

- Riverbank erosion destroys thousands of hectares of farmland and homes along Bangladesh's major rivers every monsoon.
- Families living near the bank often get little or no warning before their land falls into the river.
- Official erosion assessments depend on cloud-free optical satellite images. In Bangladesh, these are only available well after the monsoon ends, so assessments arrive late.
- Radar satellites see through clouds and work day or night. That means erosion can be mapped much sooner after each monsoon.

## 2. What we are building

- A system that maps where the riverbank eroded in past monsoons, using radar satellite imagery.
- A model that learns from this history and estimates which stretches of riverbank are most likely to erode in the next monsoon.
- An **Erosion Threat Score** for each union, combining erosion likelihood with how many people and homes are exposed.
- A map dashboard and an alert layer that make the results usable by local authorities and communities.

## 3. Study area

- One reach of the Jamuna River (Sirajganj to Gaibandha), one of the most erosion-prone stretches in the country.
- The method is designed so it can later be extended to other reaches and rivers.

## 4. The work, step by step

### Step 1: Detect past erosion

- Build a land/water map of the river area for every dry season over roughly the last ten years.
- Compare each dry season with the next one. Land that turned into sand or water during the monsoon in between is marked as eroded.
- Separate eroded farmland from eroded settlements.
- Check the land/water maps against independent optical imagery to confirm they are accurate.

### Step 2: Trace the riverbanks

- Find the main river corridor in each year's map.
- Extract the west and east banklines for every year.
- Measure how far each bank moved after every monsoon.

### Step 3: Divide the banks into segments

- Split both banks into short, equal-length segments (about 500 m each).
- For each segment and each year, record:
  - how much land eroded,
  - how far the bank retreated,
  - the shape of the bank (whether it bulges outward on a bend),
  - the width of the river at that point, and
  - how many settlements sit close to the bank.

### Step 4: Learn erosion patterns

- Erosion tends to repeat at the same places in consecutive years. Past erosion and bank shape are strong signals of future erosion.
- Train a model on past years to predict whether each segment will lose a significant amount of land in the following monsoon.
- Test it honestly: train on earlier years, then check its predictions against later years it has never seen.

### Step 5: Score each union

- Link every bank segment to the union it belongs to.
- Combine three factors:
  - the predicted chance of erosion,
  - the number of buildings and people close to the bank, and
  - how fast that bank has been retreating recently.
- The result is a single Erosion Threat Score per union, ranked from highest to lowest risk.

### Step 6: Deliver the results

- An interactive map showing past erosion, current banklines, at-risk segments, and union scores.
- An API so other tools can access the scores.
- A prototype alert in Bangla (voice or SMS) for villages in high-risk unions.

## 5. Datasets we need

| Type of data | What it is used for | Requirements |
|---|---|---|
| Radar satellite imagery (time series) | Mapping land and water in every dry season, and detecting settlements | Cloud-independent, about 10–20 m resolution, repeated every few weeks, covering ten or more years |
| Optical satellite imagery | Checking that the radar land/water maps are correct | Cloud-free dry-season images over the same area |
| Historical surface water records | Defining where the river has moved over the long term | Long time span (decades), consistent coverage |
| Administrative boundaries at union level | Assigning each bank segment to a union for scoring | Official or widely used union boundaries |
| Building or settlement locations | Counting homes exposed near the bank | Recent, individual building level if possible |
| Population distribution | Estimating how many people live near at-risk banks | Gridded population, about 100 m resolution |
| Published erosion assessments | Benchmarking our detections and predictions | Official annual erosion reports or predictions for the same river |

### Data qualities that matter most

- **Consistent over time:** the same sensor, angle, and processing every year, so changes reflect real erosion and not data differences.
- **Dry-season coverage:** comparisons are made between dry seasons, when the river is at its normal level, so flooding is not mistaken for erosion.
- **Open and free:** everything must be publicly available, so the system can be reused by local agencies.

## 6. Outputs

- Yearly maps of eroded land and eroded settlements.
- Bankline positions for every year.
- A segment-level table of erosion history and features, ready for modeling.
- Predicted erosion risk for the next monsoon.
- An Erosion Threat Score for each union.
- A dashboard, an API, and a Bangla alert prototype.

## 7. Why it matters

- Erosion maps become available within weeks after the monsoon, instead of months.
- Communities and local authorities get more time to prepare, relocate assets, or plan protection works before the next monsoon.
- Results are reported at union level, the level where local government actually acts.
- The approach uses only open satellite data, so it can be repeated every year at very low cost.
