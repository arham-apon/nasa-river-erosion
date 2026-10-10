"""Build the curated data bundle that the React frontend reads (frontend/public/data/).

Run after 05_model.py, 06_threat_score.py and 10_nisar_check.py:
    python scripts/prepare_frontend_data.py

Reads pipeline outputs (data/model, data/web, data/<region>/processed, data/<region>/nisar, data/boundaries) and public
context geometry in data/context (geoBoundaries ADM0/ADM1, Natural Earth rivers). Everything is written to a temporary
folder, validated, and only then swapped in, so a failed run leaves the previous bundle untouched.
"""
import json
import math
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString, box, mapping

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import config as C  # noqa: E402

OUT = ROOT / "frontend" / "public" / "data"
TMP = ROOT / "frontend" / "public" / "data.__building"
MODEL = ROOT / "data" / "model"
WEB = ROOT / "data" / "web"
CONTEXT = ROOT / "data" / "context"
UTM = C.CRS
REGIONS = list(C.REGIONS)
EROSION_DISPLAY_MIN_HA = 3.0
NISAR_DISPLAY_MIN_HA = 1.0
FORECAST_SEASON = 2026
BANK_3D_HALF_WIDTH_M = 45

REGION_LABEL = {
    "gaibandha": {"en": "Gaibandha reach", "bn": "গাইবান্ধা অংশ"},
    "sirajganj": {"en": "Sirajganj reach", "bn": "সিরাজগঞ্জ অংশ"},
}

CITIES = [
    ("Dhaka", "ঢাকা", 90.4125, 23.8103, "capital"),
    ("Chattogram", "চট্টগ্রাম", 91.8317, 22.3569, "city"),
    ("Khulna", "খুলনা", 89.5403, 22.8456, "city"),
    ("Rajshahi", "রাজশাহী", 88.6042, 24.3745, "city"),
    ("Sylhet", "সিলেট", 91.8687, 24.8949, "city"),
    ("Barishal", "বরিশাল", 90.3535, 22.7010, "city"),
    ("Rangpur", "রংপুর", 89.2752, 25.7439, "city"),
    ("Mymensingh", "ময়মনসিংহ", 90.4203, 24.7471, "city"),
    ("Cox's Bazar", "কক্সবাজার", 91.9794, 21.4272, "city"),
    ("Gaibandha", "গাইবান্ধা", 89.5280, 25.3297, "town"),
    ("Sirajganj", "সিরাজগঞ্জ", 89.7006, 24.4534, "town"),
]

# Natural Earth has no Meghna, Surma, Kushiyara or Old Brahmaputra; these are simplified hand traces for the
# country-scale overview only. The study reaches themselves use the pipeline's own banklines.
TRACED_RIVERS = {
    "Padma": [(90.24, 23.47), (90.40, 23.36), (90.55, 23.27), (90.65, 23.22)],
    "Meghna": [(91.27, 24.55), (91.15, 24.35), (91.00, 24.08), (90.93, 23.90), (90.78, 23.72), (90.66, 23.55),
               (90.62, 23.38), (90.65, 23.22), (90.57, 23.00), (90.62, 22.80), (90.75, 22.60), (90.85, 22.40),
               (90.95, 22.20), (91.00, 22.02)],
    "Surma": [(92.48, 24.88), (92.15, 24.93), (91.87, 24.89), (91.62, 24.98), (91.40, 25.06), (91.20, 24.92),
              (91.27, 24.55)],
    "Kushiyara": [(92.48, 24.88), (92.20, 24.80), (91.95, 24.72), (91.70, 24.68), (91.50, 24.62), (91.27, 24.55)],
    "Old Brahmaputra": [(89.73, 25.15), (89.95, 24.93), (90.20, 24.82), (90.41, 24.76), (90.60, 24.55),
                        (90.80, 24.30), (90.99, 24.06)],
    "Karnaphuli": [(92.20, 22.50), (92.07, 22.45), (91.97, 22.42), (91.91, 22.42), (91.84, 22.35), (91.80, 22.24)],
    "Matamuhuri": [(92.35, 21.60), (92.22, 21.75), (92.08, 21.78), (91.92, 21.80)],
}
RIVER_LABELS = {  # where the overview places each river name
    "Brahmaputra": (89.86, 25.80), "Jamuna": (89.68, 24.70), "Teesta": (89.20, 25.95), "Padma": (89.40, 23.80),
    "Meghna": (90.80, 23.10), "Surma": (91.62, 25.03), "Kushiyara": (91.70, 24.60),
    "Old Brahmaputra": (90.20, 24.86), "Karnaphuli": (92.02, 22.48), "Matamuhuri": (92.15, 21.70),
}


CONTEXT_SOURCES = {
    "bgd_adm0.geojson": "https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM0/"
                        "geoBoundaries-BGD-ADM0_simplified.geojson",
    "bgd_adm1.geojson": "https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM1/"
                        "geoBoundaries-BGD-ADM1_simplified.geojson",
    "ne_10m_rivers.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
                             "ne_10m_rivers_lake_centerlines.geojson",
}


class BuildError(RuntimeError):
    pass


DEM_FILE = "dem_bgd_z9.npz"
DEM_ZOOM = 9  # ~300 m per pixel at this latitude
DEM_BBOX = (87.9, 20.5, 92.8, 26.7)
DEM_RES = 0.003  # degrees per cell after reprojection (~320 m)
ELEV_BANDS_M = [10, 30, 100]  # active floodplain | older floodplain and terraces | uplands | hills


def ensure_dem():
    """Elevation for Bangladesh from AWS Terrain Tiles (Terrarium PNG, mostly SRTM), reprojected to lon/lat, cached."""
    import io
    import math
    import urllib.request
    from PIL import Image
    from rasterio.transform import from_origin
    from rasterio.warp import Resampling, reproject

    p = CONTEXT / DEM_FILE
    if p.exists():
        d = np.load(p)
        return d["z"], tuple(d["transform"])
    w, s, e, n = DEM_BBOX
    tiles = 2 ** DEM_ZOOM
    tx = lambda lon: int((lon + 180) / 360 * tiles)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * tiles)
    x0, x1, y0, y1 = tx(w), tx(e), ty(n), ty(s)
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype="float32")
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{DEM_ZOOM}/{x}/{y}.png"
            with urllib.request.urlopen(url) as r:
                rgb = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB"), dtype="float32")
            mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = (
                rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768)
    world = 2 * math.pi * 6378137
    px = world / (tiles * 256)
    src_t = from_origin(-world / 2 + x0 * 256 * px, world / 2 - y0 * 256 * px, px, px)
    dst_t = from_origin(w, n, DEM_RES, DEM_RES)
    z = np.zeros((int((n - s) / DEM_RES), int((e - w) / DEM_RES)), dtype="float32")
    reproject(mosaic, z, src_transform=src_t, src_crs="EPSG:3857", dst_transform=dst_t, dst_crs="EPSG:4326",
              resampling=Resampling.bilinear)
    np.savez_compressed(p, z=z, transform=np.array(dst_t)[:6])
    print(f"DEM {z.shape}, {int((x1 - x0 + 1) * (y1 - y0 + 1))} tiles")
    return z, tuple(np.array(dst_t)[:6])


def elevation_bands(country):
    """Areas at or above each height threshold, from a ~300 m DEM, for the overview's hypsometric tint."""
    from affine import Affine
    from rasterio import features
    from scipy.ndimage import gaussian_filter

    z, t = ensure_dem()
    transform = Affine(*t)
    # A ~600 m blur removes tree-and-roof noise in the radar DEM without moving real landform edges.
    z = gaussian_filter(z, sigma=2)
    land = country.buffer(0)
    bands = []
    for k, thr in enumerate(ELEV_BANDS_M, start=1):
        mask = (z >= thr).astype("uint8")
        polys = [shapely.geometry.shape(geom) for geom, v in features.shapes(mask, mask=mask == 1, transform=transform)]
        if not polys:
            continue
        area = shapely.unary_union(polys)
        # Light rounding (about one pixel) removes stair-steps; a ~250 m simplify keeps the real outline.
        area = area.buffer(-0.003).buffer(0.006, quad_segs=4).buffer(-0.003)
        area = area.intersection(land).simplify(0.0025)
        parts = [pp for pp in getattr(area, "geoms", [area]) if pp.geom_type == "Polygon" and pp.area > 0.0015]
        bands.append({
            "band": k,
            "minM": thr,
            "polygons": [{"outer": [[round(x, 4), round(y, 4)] for x, y in pp.exterior.coords],
                          "holes": [[[round(x, 4), round(y, 4)] for x, y in h.coords] for h in pp.interiors
                                    if shapely.Polygon(h).area > 0.0015]} for pp in parts],
        })
    return {"thresholdsM": ELEV_BANDS_M, "source": "AWS Terrain Tiles (SRTM-based), ~300 m", "bands": bands}


def ensure_context():
    """data/ is git-ignored, so fetch the small public context layers on first run."""
    import urllib.request
    CONTEXT.mkdir(parents=True, exist_ok=True)
    for name, url in CONTEXT_SOURCES.items():
        p = CONTEXT / name
        if not p.exists():
            print(f"downloading {name}")
            urllib.request.urlretrieve(url, p)


def check(cond, msg):
    if not cond:
        raise BuildError(msg)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def num(v, nd=None):
    """JSON-safe number: NaN/inf/None -> None (missing stays missing, never zero)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    if nd is None:
        return f
    r = round(f, nd)
    return int(r) if nd == 0 else r


def geom_json(g, grid=1e-5):
    return mapping(shapely.set_precision(g, grid))


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")


def write_fc(path, gdf, props):
    check(gdf.crs is not None and gdf.crs.to_epsg() == 4326, f"{path.name}: must be WGS84")
    feats = []
    for row in gdf.itertuples(index=False):
        g = row.geometry
        if g is None or g.is_empty:
            continue
        feats.append({"type": "Feature", "properties": props(row), "geometry": geom_json(g)})
    write_json(path, {"type": "FeatureCollection", "features": feats})
    return len(feats)


def bounds4326(gdf):
    b = gdf.to_crs(4326).total_bounds
    return [round(float(x), 5) for x in b]


# --------------------------------------------------------------------------------------------- unions & sections

def build_unions():
    rank = pd.read_csv(WEB / "union_ranking.csv")
    check(rank["union_id"].is_unique, "union_ranking.csv: duplicate union_id")
    rank["slug"] = rank["union_name"].map(slug)
    dup = rank.duplicated(["region", "slug"], keep=False)
    rank.loc[dup, "slug"] = rank.loc[dup, "slug"] + "-" + rank.loc[dup, "union_id"].str[-4:]
    check(not rank.duplicated(["region", "slug"]).any(), "union slugs not unique within region")
    rank["rank_region"] = rank.groupby("region")["threat_score"].rank(ascending=False, method="min").astype(int)
    rank["region_count"] = rank.groupby("region")["union_id"].transform("size")

    b = gpd.read_file(ROOT / "data" / "boundaries" / "unions_study_area.gpkg")[["shapeID", "geometry"]]
    b = b.rename(columns={"shapeID": "union_id"})
    un = b.merge(rank, on="union_id", how="inner")
    check(len(un) == len(rank), f"union boundary join lost rows: {len(un)} of {len(rank)}")
    un = un.to_crs(UTM)
    un["geometry"] = un.geometry.simplify(15)
    un = un.to_crs(4326)
    return un, rank


def build_sections(rank):
    scores = pd.read_csv(WEB / "segment_scores.csv")
    nisar = pd.concat([pd.read_csv(ROOT / "data" / r / "nisar" / "segments_2026.csv") for r in REGIONS])
    nisar = nisar[["region", "segment", "side", "nisar_eroded_ha", "nisar_major"]]
    union_slug = dict(zip(rank["union_id"], rank["slug"]))
    out = {}
    for r in REGIONS:
        seg = gpd.read_file(ROOT / "data" / r / "processed" / "segments.gpkg")[["segment", "side", "geometry"]]
        s = scores[scores["region"] == r]
        check(not s.duplicated(["segment", "side"]).any(), f"{r}: duplicate forecast rows")
        g = seg.merge(s, on=["segment", "side"], how="inner", validate="one_to_one")
        check(len(g) == len(seg) == len(s), f"{r}: section/forecast join {len(g)} vs {len(seg)} vs {len(s)}")
        g = g.merge(nisar[nisar["region"] == r].drop(columns="region"), on=["segment", "side"], how="left",
                    validate="one_to_one")
        check(len(g) == len(seg), f"{r}: NISAR join changed row count")
        g["id"] = g["side"].str[0] + g["segment"].astype(str)
        check(g["id"].is_unique, f"{r}: section ids not unique")
        g["union"] = g["union_id"].map(union_slug)
        bad = g["union_id"].notna() & g["union"].isna()
        check(not bad.any(), f"{r}: {int(bad.sum())} sections reference unions missing from the ranking")
        g["risk_rank"] = g["prob"].rank(ascending=False, method="min").astype(int)
        g["nisar_outcome"] = np.select(
            [(g.risk_class == "High") & (g.nisar_major == 1), g.nisar_major == 1, g.risk_class == "High"],
            ["hit", "missed", "not_yet"], "quiet")
        g = gpd.GeoDataFrame(g, geometry="geometry", crs=seg.crs)
        g["geometry"] = g.geometry.simplify(10)
        out[r] = g.to_crs(4326)
    return out


# --------------------------------------------------------------------------------------------- history layers

def build_banklines(r):
    g = gpd.read_file(ROOT / "data" / r / "processed" / "banklines.gpkg").to_crs(UTM)
    check(set(g["side"]) <= {"west", "east"}, f"{r}: unexpected bank side values")
    lines = g.copy()
    lines["geometry"] = lines.geometry.simplify(12)
    ribbons = g.copy()
    ribbons["geometry"] = ribbons.geometry.simplify(25).buffer(BANK_3D_HALF_WIDTH_M, cap_style="flat")
    return lines.to_crs(4326), ribbons.to_crs(4326), sorted(int(y) for y in g["dry_season"].unique())


def build_erosion(r, tmp):
    e = gpd.read_file(ROOT / "data" / r / "processed" / "erosion_polygons.gpkg").to_crs(UTM)
    check(set(e["kind"]) <= {"land", "settlement"}, f"{r}: unexpected erosion kind")
    summary = []
    years = sorted(int(y) for y in e["monsoon"].unique())
    for y in years:
        ey = e[e["monsoon"] == y]
        disp = ey[ey["area_ha"] >= EROSION_DISPLAY_MIN_HA].copy()
        disp["geometry"] = disp.geometry.simplify(10)
        n = write_fc(tmp / "erosion" / r / f"{y}.geojson", disp.to_crs(4326),
                     lambda row: {"kind": row.kind, "ha": num(row.area_ha, 1)})
        summary.append({
            "monsoon": y,
            "totalMappedHa": num(ey["area_ha"].sum(), 1),
            "settlementMappedHa": num(ey.loc[ey["kind"] == "settlement", "area_ha"].sum(), 1),
            "patchCount": int(len(ey)),
            "displayedHa": num(disp["area_ha"].sum(), 1),
            "displayedCount": n,
        })
    return years, summary


def build_histories(r, sections):
    t = pd.read_csv(ROOT / "data" / r / "processed" / "training_table.csv")
    t = t[t["split"] == "train"]
    years = sorted(int(y) for y in t["year"].unique())
    t["id"] = t["side"].str[0] + t["segment"].astype(str)
    known = set(sections["id"])
    check(set(t["id"]) <= known, f"{r}: history rows reference unknown sections")
    check(not t.duplicated(["id", "year"]).any(), f"{r}: duplicate section-year rows")
    h = pd.read_csv(MODEL / "hindcast_predictions.csv")
    h = h[h["region"] == r].copy()
    h["id"] = h["side"].str[0] + h["segment"].astype(str)
    hind_years = sorted(int(y) for y in h["year"].unique())

    secs = {}
    for sid, g in t.groupby("id"):
        g = g.set_index("year").reindex(years)
        hh = h[h["id"] == sid].set_index("year").reindex(hind_years)
        secs[sid] = {
            "e": [num(v, 2) for v in g["target_eroded_ha"]],
            "s": [num(v, 2) for v in g["target_eroded_settlement_ha"]],
            "r": [num(v, 0) for v in g["target_retreat_m"]],
            "h": [None if pd.isna(o) else o for o in hh["outcome"]],
            "hp": [num(v, 3) for v in hh["prob"]],
        }
    bank_totals = [num(t.loc[t["year"] == y, "target_eroded_ha"].sum(min_count=1), 1) for y in years]
    return {"region": r, "years": years, "hindcastYears": hind_years, "sections": secs,
            "sectionTotalsHa": bank_totals}


def build_nisar(r, tmp):
    d = ROOT / "data" / r / "nisar"
    tl = pd.read_csv(d / "timeline.csv")
    cal = pd.read_csv(d / "calibration.csv")
    check(tl["date"].is_unique, f"{r}: duplicate NISAR dates")
    e = gpd.read_file(d / "erosion_2026.gpkg").to_crs(UTM)
    after = sorted(e["after"].unique()) if len(e) else []
    check(len(after) <= 1, f"{r}: NISAR erosion mixes several 'after' dates: {after}")
    disp = e[e["area_ha"] >= NISAR_DISPLAY_MIN_HA].copy()
    disp["geometry"] = disp.geometry.simplify(10)
    n = write_fc(tmp / "observations" / f"nisar-{r}.geojson", disp.to_crs(4326),
                 lambda row: {"kind": row.kind, "ha": num(row.area_ha, 1)})
    obs = {
        "region": r,
        "provisional": True,
        "geometryDate": after[0] if after else None,
        "timeline": [{"date": row.date, "waterHa": num(row.water_ha, 0),
                      "dryLandUnderWaterHa": num(row.dry_season_land_under_water_ha, 0),
                      "validFraction": num(row.valid_fraction, 3)} for row in tl.itertuples()],
        "calibration": [{"date": row.date, "pol": row.pol, "thresholdDb": num(row.threshold_db, 2),
                         "balancedAccuracy": num(row.balanced_accuracy, 3)} for row in cal.itertuples()],
        "mapped": {"totalHa": num(e["area_ha"].sum(), 1), "patchCount": int(len(e)),
                   "displayedHa": num(disp["area_ha"].sum(), 1), "displayedCount": n,
                   "settlementHa": num(e.loc[e["kind"] == "settlement", "area_ha"].sum(), 1)},
    }
    write_json(tmp / "observations" / f"nisar-{r}.json", obs)
    return obs


# --------------------------------------------------------------------------------------------- evaluation & alerts

def build_evaluation():
    ts = pd.read_csv(MODEL / "results_time_split.csv")
    cr = pd.read_csv(MODEL / "results_cross_region.csv")
    fi = pd.read_csv(MODEL / "feature_importance.csv")
    fi = fi.rename(columns={fi.columns[0]: "feature"})
    check(list(fi.columns) == ["feature", "importance"], f"feature_importance columns: {list(fi.columns)}")
    nc = pd.read_csv(MODEL / "nisar_forecast_check.csv")
    info = json.loads((MODEL / "run_info.json").read_text())
    cr[["train", "model"]] = cr["model"].str.split(": ", n=1, expand=True)
    cr[["trainRegion", "testRegion"]] = cr["train"].str.split("->", expand=True)

    def rec(df, cols):
        return [{k: (num(v, 3) if isinstance(v, (int, float, np.floating, np.integer)) else v)
                 for k, v in zip(cols, row)} for row in df[cols].itertuples(index=False)]

    metric_cols = ["model", "pr_auc", "recall_top20", "precision_top20", "positives", "rows"]
    return {
        "timeSplit": {"trainLast": info["train_last"], "testYears": info["test_years"],
                      "rows": rec(ts, metric_cols)},
        "crossRegion": rec(cr, ["trainRegion", "testRegion"] + metric_cols),
        "featureImportance": rec(fi, ["feature", "importance"]),
        "nisarCheck": rec(nc, ["scope", "model", "stretches", "major_nisar", "eroded_ha", "pr_auc", "recall_top20",
                               "precision_top20", "major_share_high", "major_share_medium", "major_share_low"]),
        "topFraction": info["top_frac"],
        "labelledRows": info["labelled_rows"],
        "forecastRows": info["forecast_rows"],
        "targetHa": C.EROSION_TARGET_HA,
        "features": info["features"],
    }


def build_alerts(rank, snapshot):
    raw = json.loads((WEB / "alerts_bn.json").read_text(encoding="utf-8"))
    out = []
    for a in raw:
        m = rank[(rank["region"] == a["region"]) & (rank["union_name"] == a["union"])]
        check(len(m) == 1, f"alert for {a['union']} ({a['region']}) matches {len(m)} unions")
        out.append({"region": a["region"], "union": m.iloc[0]["slug"], "unionName": a["union"],
                    "textBn": a["text"], "season": FORECAST_SEASON, "dataDate": snapshot, "audio": None})
    return out


# --------------------------------------------------------------------------------------------- 3D overview context

def build_context(unions):
    bd = gpd.read_file(CONTEXT / "bgd_adm0.geojson").to_crs(4326)
    country = bd.geometry.union_all()
    outline = gpd.GeoSeries([country], crs=4326).to_crs(UTM).simplify(1500).to_crs(4326).iloc[0]
    polys = [p for p in getattr(outline, "geoms", [outline]) if p.area > 0.0008]

    adm1 = gpd.read_file(CONTEXT / "bgd_adm1.geojson").to_crs(4326)
    inner = adm1.boundary.union_all().difference(country.boundary.buffer(0.02))
    inner = gpd.GeoSeries([inner], crs=4326).to_crs(UTM).simplify(1500).to_crs(4326).iloc[0]
    division_lines = [list(l.coords) for l in getattr(inner, "geoms", [inner]) if l.length > 0.05]

    ne = gpd.read_file(CONTEXT / "ne_10m_rivers.geojson")
    clip = country.buffer(0.03)
    rivers = []
    for name, rank_ in [("Brahmaputra", 1), ("Ganges", 1), ("Tista", 2)]:
        g = ne[ne["name"] == name].geometry.union_all().intersection(clip)
        g = gpd.GeoSeries([g], crs=4326).to_crs(UTM).simplify(800).to_crs(4326).iloc[0]
        for l in getattr(g, "geoms", [g]):
            if l.length > 0.05:
                label = {"Ganges": "Padma", "Tista": "Teesta"}.get(name, name)
                ys = [c[1] for c in l.coords]
                r = rank_
                # Main stems keep full weight; delta distributaries and the Dhaleshwari are drawn thinner.
                if name == "Ganges" and min(ys) < 23.7:
                    r = 3
                if name == "Brahmaputra" and max(ys) < 24.3:
                    r = 3
                rivers.append({"name": label, "rank": r, "coords": [[round(x, 4), round(y, 4)] for x, y in l.coords]})
    for name, pts in TRACED_RIVERS.items():
        l = LineString(pts).intersection(clip)
        for part in getattr(l, "geoms", [l]):
            if not part.is_empty:
                rivers.append({"name": name, "rank": 1 if name in ("Padma", "Meghna") else 2, "traced": True,
                               "coords": [[round(x, 4), round(y, 4)] for x, y in part.coords]})

    # Per-river geometry for the river pages. North of Bahadurabad the main stem is the Brahmaputra, south of it
    # the Jamuna down to the Padma confluence; the overview map draws them as one line.
    def coords_of(g):
        return [[[round(x, 4), round(y, 4)] for x, y in l.coords] for l in getattr(g, "geoms", [g]) if not l.is_empty]

    main = shapely.unary_union([LineString(r["coords"]) for r in rivers if r["name"] == "Brahmaputra" and r["rank"] == 1])
    river_paths = {
        "Brahmaputra": coords_of(main.intersection(box(87, 25.15, 93, 27))),
        "Jamuna": coords_of(main.intersection(box(87, 23.75, 93, 25.15))),
    }
    for name in ["Padma", "Teesta", "Meghna", "Surma", "Kushiyara", "Old Brahmaputra", "Karnaphuli", "Matamuhuri"]:
        river_paths[name] = [r["coords"] for r in rivers if r["name"] == name and r["rank"] < 3]
    # Natural Earth files the stretch below the Jamuna confluence (Goalundo to Mawa) under the Brahmaputra.
    river_paths["Padma"] += coords_of(main.intersection(box(87, 20, 93, 23.75)))
    check(all(river_paths.values()), f"river without geometry: {[k for k, v in river_paths.items() if not v]}")

    # Division shapes, flagged when a study reach falls inside: the overview shades them one step lighter.
    reach_area = {r: unions[unions["region"] == r].to_crs(UTM).geometry.union_all() for r in REGIONS}
    division_areas = []
    for row in adm1.to_crs(UTM).itertuples():
        g = row.geometry.simplify(1500)
        has = any(g.intersection(a).area > 0.05 * a.area for a in reach_area.values())
        g4326 = gpd.GeoSeries([g], crs=UTM).to_crs(4326).iloc[0]
        rings = [[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]
                 for p in getattr(g4326, "geoms", [g4326]) if p.area > 0.0008]
        division_areas.append({"name": row.shapeName, "hasReach": bool(has), "rings": rings})
    check(sum(d["hasReach"] for d in division_areas) >= 1, "no division contains a study reach")

    regions = {}
    for r in REGIONS:
        u = unions[unions["region"] == r].to_crs(UTM)
        shape = u.geometry.union_all().buffer(250).simplify(400)
        shape = gpd.GeoSeries([shape], crs=UTM).to_crs(4326).iloc[0]
        rings = [[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]
                 for p in getattr(shape, "geoms", [shape]) if p.area > 0.0003]
        c = shape.centroid
        banks = gpd.read_file(ROOT / "data" / r / "processed" / "banklines.gpkg")
        latest = banks[banks["dry_season"] == banks["dry_season"].max()].to_crs(UTM).simplify(150).to_crs(4326)
        regions[r] = {"label": REGION_LABEL[r], "center": [round(c.x, 4), round(c.y, 4)], "rings": rings,
                      "bbox": C.REGIONS[r]["bbox"],
                      "banks": [[[round(x, 4), round(y, 4)] for x, y in l.coords] for l in latest]}

    return {
        "bounds": [round(float(v), 4) for v in country.bounds],
        "outline": [[[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]] for p in polys],
        "divisions": [[[round(x, 4), round(y, 4)] for x, y in l] for l in division_lines],
        "divisionAreas": division_areas,
        "elevation": elevation_bands(country),
        "rivers": rivers,
        "riverPaths": river_paths,
        "riverLabels": [{"name": k, "at": list(v)} for k, v in RIVER_LABELS.items()],
        "cities": [{"name": n, "nameBn": nb, "at": [x, y], "kind": k} for n, nb, x, y, k in CITIES],
        "regions": regions,
    }


# --------------------------------------------------------------------------------------------- main

def validate(tmp, manifest):
    """Cross-file checks on the written bundle (the Node validator repeats the essential ones at deploy time)."""
    def load(p):
        return json.loads((tmp / p).read_text(encoding="utf-8"))

    unions = load(manifest["layers"]["unions"])
    ukeys = {(f["properties"]["region"], f["properties"]["key"]) for f in unions["features"]}
    check(len(ukeys) == len(unions["features"]), "duplicate union keys")
    for r in REGIONS:
        lay = manifest["regions"][r]["layers"]
        fc = load(lay["forecast"])
        for f in fc["features"]:
            p = f["properties"]
            check(0 <= p["prob"] <= 1, f"{r}/{p['id']}: probability out of range")
            check(p["risk"] in ("High", "Medium", "Low"), f"{r}/{p['id']}: bad risk class")
            check(p["union"] is None or (r, p["union"]) in ukeys, f"{r}/{p['id']}: dangling union {p['union']}")
        hist = load(lay["history"])
        ids = {f["properties"]["id"] for f in fc["features"]}
        check(set(hist["sections"]) <= ids, f"{r}: history ids missing from forecast layer")
        for y in manifest["regions"][r]["erosionYears"]:
            check((tmp / lay["erosion"].replace("{year}", str(y))).exists(), f"{r}: erosion layer {y} missing")
        w, s, e, n = manifest["regions"][r]["bounds"]
        check(88 < w < e < 93 and 20 < s < n < 27, f"{r}: bounds outside Bangladesh: {manifest['regions'][r]['bounds']}")
    for a in load(manifest["layers"]["alerts"]):
        check((a["region"], a["union"]) in ukeys, f"alert references unknown union {a['union']}")


def swap_in():
    """Replace OUT with the validated TMP. The previous bundle is restored if anything fails.

    A running dev server's file watcher can lock the folder on Windows, so a failed rename falls back to copying.
    """
    old = OUT.with_name(OUT.name + ".__previous")
    if old.exists():
        shutil.rmtree(old)
    had_old = OUT.exists()
    try:
        if had_old:
            OUT.rename(old)
        TMP.rename(OUT)
    except OSError:
        try:
            if had_old and not OUT.exists():
                old.rename(OUT)
            had_old = False
            shutil.copytree(TMP, OUT, dirs_exist_ok=True)
            for f in [f for f in OUT.rglob("*") if f.is_file() and not (TMP / f.relative_to(OUT)).exists()]:
                f.unlink()
            shutil.rmtree(TMP)
        except OSError as err:
            if old.exists() and not OUT.exists():
                old.rename(OUT)
            raise BuildError(f"could not replace {OUT}: {err}") from err
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)


def main():
    ensure_context()
    for p in [WEB / "union_ranking.csv", WEB / "segment_scores.csv", MODEL / "hindcast_predictions.csv",
              MODEL / "nisar_forecast_check.csv"]:
        check(p.exists(), f"missing input {p.relative_to(ROOT)}; run 05, 06 and 10 first (see run.txt)")
    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)

    nisar_dates = sorted(set(pd.concat([pd.read_csv(ROOT / "data" / r / "nisar" / "timeline.csv")["date"]
                                        for r in REGIONS])))
    snapshot = nisar_dates[-1]

    unions, rank = build_unions()
    n_unions = write_fc(TMP / "unions.geojson", unions, lambda u: {
        "key": u.slug, "region": u.region, "unionId": u.union_id, "name": u.union_name,
        "score": num(u.threat_score, 3), "level": u.threat_level, "rankRegion": int(u.rank_region),
        "regionCount": int(u.region_count), "maxScore": num(u.max_score, 3), "meanScore": num(u.mean_score, 3),
        "sections": int(u.stretches), "highSections": int(u.high_stretches),
        "population": num(u.population, 0), "buildings": num(u.buildings, 0)})

    sections = build_sections(rank)
    regions_meta, counts = {}, {"unions": n_unions}
    for r in REGIONS:
        s = sections[r]
        n = write_fc(TMP / "forecasts" / f"{r}.geojson", s, lambda p: {
            "id": p.id, "segment": int(p.segment), "side": p.side, "union": p.union if isinstance(p.union, str) else None,
            "unionName": p.union_name if isinstance(p.union_name, str) else None,
            "prob": num(p.prob, 3), "risk": p.risk_class, "riskRank": int(p.risk_rank),
            "score": num(p.segment_score, 3), "retreatRecentM": num(p.retreat_recent_m, 0),
            "erodedLastHa": num(p.eroded_ha_lag1, 2), "population": num(p.population, 0),
            "buildings": num(p.buildings, 0), "nisarHa": num(p.nisar_eroded_ha, 2),
            "nisarMajor": None if pd.isna(p.nisar_major) else int(p.nisar_major), "nisarOutcome": p.nisar_outcome})
        counts[f"sections_{r}"] = n

        lines, ribbons, bank_years = build_banklines(r)
        write_fc(TMP / "banklines" / f"{r}.geojson", lines,
                 lambda b: {"year": int(b.dry_season), "side": b.side})
        write_fc(TMP / "banklines" / f"{r}-3d.geojson", ribbons,
                 lambda b: {"year": int(b.dry_season), "side": b.side})

        erosion_years, erosion_summary = build_erosion(r, TMP)
        hist = build_histories(r, s)
        hist["erosion"] = erosion_summary
        write_json(TMP / "histories" / f"{r}.json", hist)
        obs = build_nisar(r, TMP)

        regions_meta[r] = {
            "label": REGION_LABEL[r],
            "bbox": C.REGIONS[r]["bbox"],
            "bounds": bounds4326(s),
            "sections": n,
            "unions": int((rank["region"] == r).sum()),
            "highSections": int((s["risk_class"] == "High").sum()),
            "bankYears": bank_years,
            "erosionYears": erosion_years,
            "historyYears": hist["years"],
            "nisarDates": [t["date"] for t in obs["timeline"]],
            "erosionByMonsoon": [{"monsoon": e["monsoon"], "totalMappedHa": e["totalMappedHa"]}
                                 for e in erosion_summary],
            "nisarMappedHa": obs["mapped"]["totalHa"],
            "layers": {
                "forecast": f"forecasts/{r}.geojson",
                "banklines": f"banklines/{r}.geojson",
                "banklines3d": f"banklines/{r}-3d.geojson",
                "erosion": f"erosion/{r}/{{year}}.geojson",
                "history": f"histories/{r}.json",
                "nisar": f"observations/nisar-{r}.json",
                "nisarGeometry": f"observations/nisar-{r}.geojson",
            },
        }

    write_json(TMP / "evaluation.json", build_evaluation())
    alerts = build_alerts(rank, snapshot)
    write_json(TMP / "alerts.json", alerts)
    write_json(TMP / "context" / "bangladesh.json", build_context(unions))

    manifest = {
        "schemaVersion": 1,
        "snapshotId": snapshot,
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "forecastSeason": FORECAST_SEASON,
        "hindcastYears": sorted(int(y) for y in pd.read_csv(MODEL / "hindcast_predictions.csv")["year"].unique()),
        "targetHa": C.EROSION_TARGET_HA,
        "segmentLengthM": C.SEGMENT_LENGTH_M,
        "bankBufferM": C.BANK_BUFFER_M,
        "regions": regions_meta,
        "nisar": {"dates": nisar_dates, "latestDate": snapshot, "provisional": True, "framesAvailable": False},
        "display": {"erosionMinHa": EROSION_DISPLAY_MIN_HA, "nisarMinHa": NISAR_DISPLAY_MIN_HA},
        "exposure": {"populationSource": "WorldPop", "populationYear": C.WORLDPOP_YEAR,
                     "buildingsSource": "Google Open Buildings v3", "buildingConfidence": C.BUILDING_CONFIDENCE},
        "priorityWeights": {"risk": 0.5, "retreat": 0.2, "population": 0.2, "buildings": 0.1},
        "counts": {**counts, "alerts": len(alerts)},
        "layers": {"unions": "unions.geojson", "evaluation": "evaluation.json", "alerts": "alerts.json",
                   "context": "context/bangladesh.json"},
    }
    write_json(TMP / "manifest.json", manifest)
    validate(TMP, manifest)
    swap_in()
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
    print(f"Bundle written to {OUT.relative_to(ROOT)} ({size:.1f} MB): {json.dumps(manifest['counts'])}")


if __name__ == "__main__":
    try:
        main()
    except BuildError as err:
        print(f"FAILED: {err}\nThe previous bundle (if any) was left unchanged.", file=sys.stderr)
        sys.exit(1)
