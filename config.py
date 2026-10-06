import os
from pathlib import Path

GEE_PROJECT = "nasa-river-erosion"

# Study regions. Pick one with the environment variable CEW_REGION (default: gaibandha).
#   cmd:        set CEW_REGION=sirajganj
#   PowerShell: $env:CEW_REGION = "sirajganj"
REGIONS = {
    "gaibandha": {
        "bbox": [89.50, 25.04, 89.95, 25.42],
        "folder": "erosion_Shaghata_and_Fulchhari_Gaibandha",
        "threshold_db": -15.0,
        "asc_orbit": 114,
        "desc_orbit": 150,
    },
    "sirajganj": {
        "bbox": [89.51, 23.98, 89.94, 24.81],
        "folder": "erosion_Chauhali_and_Kazipur_Sirajganj",
        "threshold_db": -15.0,
        "asc_orbit": 114,
        "desc_orbit": 150,
    },
}
REGION = os.environ.get("CEW_REGION", "gaibandha")
if REGION not in REGIONS:
    raise SystemExit(f"Unknown CEW_REGION={REGION!r}; choose one of {list(REGIONS)}")
_R = REGIONS[REGION]
AOI_BBOX = _R["bbox"]
DRIVE_FOLDER = _R["folder"]
LAND_THRESHOLD_DB = _R["threshold_db"]
ASC_ORBIT = _R["asc_orbit"]
DESC_ORBIT = _R["desc_orbit"]

CRS = "EPSG:32645"
SCALE_NATIVE = 10
SCALE_EXPORT = 20

FIRST_DRY_SEASON = 2015
LAST_DRY_SEASON = 2026

INCIDENCE_MIN = 30
INCIDENCE_MAX = 45
BOXCAR_RADIUS_PX = 3
PS_DISPERSION_MAX = 0.4
PS_MEAN_DB_MIN = -4.0

VALIDATION_YEARS = list(range(2019, 2027))
VALIDATION_THRESHOLDS = [-18.0, -17.0, -16.5, -16.0, -15.5, -15.0, -14.5, -14.0, -13.5, -13.2, -13.0, -12.5, -12.0, -11.0]
VALIDATION_POINTS = 8000
NDVI_VEG = 0.1

BUILDING_CONFIDENCE = 0.75
WORLDPOP_YEAR = 2020

MIN_PATCH_PX = 25  # 1 ha at 20 m; smaller patches were mostly false in the Step 7 optical check
EROSION_TOUCH_CORRIDOR = True  # keep only patches touching the main river corridor of the year before (Step 7)
CORRIDOR_CLOSING_ITER = 3
CORRIDOR_OPENING_ITER = 5  # after filling holes, cut off tributaries and side arms narrower than ~11 px (220 m)
SEGMENT_LENGTH_M = 500
BANK_BUFFER_M = 2000
BANK_TOLERANCE_M = 60
MIN_VALID_ROW_FRACTION = 0.5
EROSION_TARGET_HA = 5.0

# NISAR L-band (Steps 13-14). Track 69 ascending, frame 14 covers both regions fully, every 12 days from 2026-06-18.
NISAR_TRACK = 69
NISAR_DIRECTION = "ASCENDING"
NISAR_FRAME = 14
NISAR_START = "2026-06-01"
NISAR_AFTER_PASSES = 2  # a pixel counts as eroded only if it is open water in each of the latest N passes
NISAR_MAX_RETREAT_M = 1000  # ignore "erosion" farther than this from the dry-season river (same limit as MAX_JUMP_M)

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ["CEW_DATA"]) if os.environ.get("CEW_DATA") else ROOT / "data" / REGION
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
BOUNDARIES = ROOT / "data" / "boundaries"
NISAR = DATA / "nisar"
