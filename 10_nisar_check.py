"""Step 15: Score the 2026 forecast against NISAR-observed erosion, and export the NISAR layers for the dashboard.

Both regions at once (no CEW_REGION needed). Needs 09_nisar_erosion.py for every region first.
Output: data/model/nisar_forecast_check.csv, data/web/nisar_*.{geojson,json}, data/web/nisar/<region>_<date>.png
"""
import json
import re
import shutil

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from PIL import Image
from rasterio.warp import Resampling, calculate_default_transform, reproject
from sklearn.metrics import average_precision_score

import config as C

OUT = C.ROOT / "data" / "web"
MODEL = C.ROOT / "data" / "model"
DB_RANGE = (-25.0, 0.0)  # grey scale of the radar quick-looks
QUICKLOOK_M = 50


def region_dir(r):
    return C.ROOT / "data" / r / "nisar"


def top20(df):
    """Rows of the top 20% of each region, as in 05_model.py (risk classes are also set per region)."""
    return [i for _, g in df.groupby("region") for i in g.index[:max(1, int(round(0.2 * len(g))))]]


def scores(df, col):
    y = df["nisar_major"].to_numpy()
    s = df[col].fillna(0).to_numpy()
    top = top20(df.assign(_s=s).sort_values("_s", ascending=False, kind="stable"))
    flagged = df.loc[top, "nisar_major"]
    return {"pr_auc": average_precision_score(y, s) if y.any() else np.nan,
            "recall_top20": flagged.sum() / max(y.sum(), 1),
            "precision_top20": flagged.mean()}


def forecast_check(seg):
    rows = []
    for scope, df in [("both", seg)] + list(seg.groupby("region")):
        base = {"scope": scope, "stretches": len(df), "major_nisar": int(df.nisar_major.sum()),
                "eroded_ha": round(df.nisar_eroded_ha.sum(), 1)}
        for name, col in [("gradient boosting forecast", "prob"), ("persistence (2025 erosion)", "eroded_ha_lag1")]:
            rows.append({**base, "model": name, **scores(df, col)})
        # Expected scores of a random ranking (one random draw is too noisy with few events)
        share = df.nisar_major.mean()
        rows.append({**base, "model": "random (expected)", "pr_auc": share,
                     "recall_top20": len(top20(df)) / len(df), "precision_top20": share})
        for rc in ("High", "Medium", "Low"):
            sub = df[df.risk_class == rc]
            base[f"major_share_{rc.lower()}"] = round(sub.nisar_major.mean(), 3) if len(sub) else np.nan
        for r in rows[-3:]:
            r.update({k: v for k, v in base.items() if k.startswith("major_share")})
    return pd.DataFrame(rows).round(3)


def quicklooks():
    frames = []
    (OUT / "nisar").mkdir(parents=True, exist_ok=True)
    for r in C.REGIONS:
        for f in sorted(f for f in region_dir(r).glob("gcov_*.tif") if re.fullmatch(r"gcov_\d{8}", f.stem)):
            with rasterio.open(f) as src:
                t, w, h = calculate_default_transform(src.crs, "EPSG:4326", src.width, src.height, *src.bounds,
                                                      resolution=QUICKLOOK_M / 111320)
                dst = np.full((h, w), np.nan, dtype="float32")
                reproject(rasterio.band(src, 1), dst, dst_transform=t, dst_crs="EPSG:4326",
                          resampling=Resampling.average, dst_nodata=np.nan)
            g = np.clip((dst - DB_RANGE[0]) / (DB_RANGE[1] - DB_RANGE[0]), 0, 1)
            la = np.zeros((h, w, 2), dtype=np.uint8)  # grey + alpha: half the size of RGBA
            la[..., 0] = (np.nan_to_num(g) * 255).astype(np.uint8)
            la[..., 1] = np.where(np.isfinite(dst), 255, 0)
            date = f.stem.split("_")[1]
            name = f"nisar/{r}_{date}.png"
            Image.fromarray(la, mode="LA").save(OUT / name, optimize=True)
            frames.append({"region": r, "date": f"{date[:4]}-{date[4:6]}-{date[6:]}", "png": name,
                           "bounds": [[t.f + h * t.e, t.c], [t.f, t.c + w * t.a]]})
    (OUT / "nisar_frames.json").write_text(json.dumps(frames, indent=1))
    return len(frames)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    seg = pd.concat([pd.read_csv(region_dir(r) / "segments_2026.csv") for r in C.REGIONS], ignore_index=True)
    check = forecast_check(seg)
    check.to_csv(MODEL / "nisar_forecast_check.csv", index=False)
    print(check.to_string(index=False))
    (OUT / "nisar_forecast_check.json").write_text(check.to_json(orient="records"))

    timeline = pd.concat([pd.read_csv(region_dir(r) / "timeline.csv").assign(region=r) for r in C.REGIONS])
    (OUT / "nisar_timeline.json").write_text(timeline.to_json(orient="records"))
    cal = pd.concat([pd.read_csv(region_dir(r) / "calibration.csv").assign(region=r) for r in C.REGIONS])
    (OUT / "nisar_calibration.json").write_text(cal.to_json(orient="records"))

    parts = []
    for r in C.REGIONS:
        g = gpd.read_file(region_dir(r) / "erosion_2026.gpkg")
        if len(g):
            parts.append(g.assign(region=r).to_crs(4326))
    if parts:
        g = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=4326)
        g["geometry"] = g.geometry.simplify(0.0001)
        g["area_ha"] = g.area_ha.round(1)
        g[["region", "monsoon", "kind", "after", "area_ha", "geometry"]].to_file(OUT / "nisar_erosion.geojson",
                                                                                driver="GeoJSON")

    segs = []
    for r in C.REGIONS:
        s = gpd.read_file(C.ROOT / "data" / r / "processed" / "segments.gpkg")[["segment", "side", "geometry"]]
        segs.append(s.merge(seg[seg.region == r], on=["segment", "side"]).to_crs(4326))
    s = gpd.GeoDataFrame(pd.concat(segs, ignore_index=True), crs=4326)
    s["outcome"] = np.select(
        [(s.risk_class == "High") & (s.nisar_major == 1), s.nisar_major == 1, s.risk_class == "High"],
        ["hit", "missed", "not_yet"], "quiet")
    s[["region", "segment", "side", "union_name", "prob", "risk_class", "nisar_eroded_ha", "nisar_major", "outcome",
       "geometry"]].to_file(OUT / "nisar_segments.geojson", driver="GeoJSON")
    print(f"\n{quicklooks()} radar quick-looks written to {OUT / 'nisar'}")
    shutil.copy(C.ROOT / "web" / "dashboard.html", OUT / "dashboard.html")
    print(f"Copied web/dashboard.html to {OUT}")


if __name__ == "__main__":
    main()
