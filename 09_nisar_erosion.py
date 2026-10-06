"""Step 14: NISAR land/water maps through the 2026 monsoon, and 2026 erosion mapped weeks after it happened.

Before = Sentinel-1 dry-season 2026 class map (Nov 2025-Apr 2026), land also in the first NISAR pass (June).
After  = open water in each of the latest NISAR passes.
The NISAR water threshold is calibrated on pixels whose answer is known from 38 years of JRC surface water
(always water vs never water on high ground), not copied from Sentinel-1 (different band, C vs L).

Run per region (CEW_REGION). Needs 08_nisar_fetch.py first.
Output in data/<region>/nisar/: calibration.csv, timeline.csv, water_stack.tif, eroded_2026.tif,
       erosion_2026.gpkg, segments_2026.csv (NISAR erosion per bank stretch next to the model's 2026 forecast).
"""
import importlib
import re

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import shape

import config as C

e03 = importlib.import_module("03_erosion")
f04 = importlib.import_module("04_features")
corridor = f04.corridor
NODATA = 255
THRESHOLDS = np.arange(-30.0, -5.0, 0.25)
WATER_REF_JRC = 75  # % of months with water, 1984-2021
LAND_REF_HAND_M = 2.0
RIVER_BELT_M = 3000  # timeline counts water within this distance of the dry-season river


def load_passes():
    files = sorted(f for f in C.NISAR.glob("gcov_*.tif") if re.fullmatch(r"gcov_\d{8}", f.stem))  # skip .part.tif
    if not files:
        raise SystemExit(f"No NISAR passes in {C.NISAR}; run 08_nisar_fetch.py first")
    dates, hh, hv = [], [], []
    for f in files:
        with rasterio.open(f) as src:
            dates.append(pd.Timestamp(f.stem.split("_")[1]).date().isoformat())
            hh.append(src.read(1))
            hv.append(src.read(2))
    return dates, np.stack(hh), np.stack(hv)


def smooth_db(db):
    """3x3 mean in linear power, ignoring no-data (removes most remaining speckle at 20 m)."""
    ok = np.isfinite(db)
    lin = np.where(ok, 10 ** (db / 10), 0.0)
    n = ndimage.uniform_filter(ok.astype("float32"), 3)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = 10 * np.log10(ndimage.uniform_filter(lin, 3) / n)
    out[~ok] = np.nan
    return out.astype("float32")


def calibrate(stacks, water_ref, land_ref, dates):
    """Best single-polarisation threshold by balanced accuracy, pooled over all passes."""
    best = None
    for pol, st in stacks.items():
        w, l = st[:, water_ref], st[:, land_ref]
        w, l = w[np.isfinite(w)], l[np.isfinite(l)]
        for t in THRESHOLDS:
            ba = ((w < t).mean() + (l >= t).mean()) / 2
            if best is None or ba > best[2]:
                best = (pol, float(t), ba)
    pol, t, _ = best
    rows = []
    for i, d in enumerate(dates):
        v = stacks[pol][i]
        w, l = v[water_ref], v[land_ref]
        w, l = w[np.isfinite(w)], l[np.isfinite(l)]
        rows.append({"date": d, "pol": pol, "threshold_db": t, "water_ok": (w < t).mean(), "land_ok": (l >= t).mean(),
                     "balanced_accuracy": ((w < t).mean() + (l >= t).mean()) / 2,
                     "water_median_db": np.median(w), "land_median_db": np.median(l)})
    return pol, t, pd.DataFrame(rows).round(3)


def segment_check(eroded, cls, transform, px_ha):
    """NISAR erosion per bank stretch, counted exactly like the model's target (04_features.py): per image row,
    from the 2026 bank line 2 km landward plus 60 m riverward, summed over the 500 m stretch."""
    px = abs(transform.a)
    rows_per_seg = max(1, int(round(C.SEGMENT_LENGTH_M / abs(transform.e))))
    n_seg = cls.shape[0] // rows_per_seg
    buf_px, tol_px = int(round(C.BANK_BUFFER_M / px)), int(round(C.BANK_TOLERANCE_M / px))
    cols = f04.bank_cols(f04.corridor(cls))
    rows = []
    for side in ("west", "east"):
        ha = f04.seg_reduce(f04.window_sum(eroded, cols[side], side, buf_px, tol_px), rows_per_seg, n_seg, "sum") * px_ha
        rows += [{"segment": i, "side": side, "nisar_eroded_ha": v} for i, v in enumerate(ha)]
    seg = pd.DataFrame(rows)
    f = pd.read_csv(C.ROOT / "data" / "model" / "forecast_predictions.csv")
    f = f[f.region == C.REGION][["segment", "side", "prob", "risk_class", "eroded_ha_lag1", "union_name"]]
    out = f.merge(seg, on=["segment", "side"], how="left")  # the stretches the model forecast for
    out["nisar_eroded_ha"] = out.nisar_eroded_ha.round(2)
    out["nisar_major"] = (out.nisar_eroded_ha >= C.EROSION_TARGET_HA).astype(int)
    out["region"] = C.REGION
    return out


def main():
    C.NISAR.mkdir(parents=True, exist_ok=True)
    cls, transform, crs = e03.load_year(C.LAST_DRY_SEASON)
    with rasterio.open(C.RAW / "static_layers.tif") as src:
        jrc, hand = src.read(1).astype("float32"), src.read(2).astype("float32")
    jrc[jrc == -9999] = np.nan
    hand[hand == -9999] = np.nan
    px = abs(transform.a)
    px_ha = abs(transform.a * transform.e) / 1e4

    dates, hh, hv = load_passes()
    hh = np.stack([smooth_db(a) for a in hh])
    hv = np.stack([smooth_db(a) for a in hv])
    print(f"{C.REGION}: {len(dates)} NISAR passes {dates[0]} .. {dates[-1]}")

    # 1. Calibrate the L-band water threshold
    water_ref = (jrc >= WATER_REF_JRC) & (cls == 0)
    land_ref = (jrc == 0) & np.isin(cls, (1, 2)) & (hand >= LAND_REF_HAND_M)
    pol, thr, cal = calibrate({"hh": hh, "hv": hv}, water_ref, land_ref, dates)
    cal.to_csv(C.NISAR / "calibration.csv", index=False)
    print(f"Water threshold: {pol.upper()} < {thr:.2f} dB; balanced accuracy per pass "
          f"{cal.balanced_accuracy.min():.3f}-{cal.balanced_accuracy.max():.3f} "
          f"({water_ref.sum()} water / {land_ref.sum()} land reference pixels)")

    # 2. Water map for every pass
    st = hh if pol == "hh" else hv
    valid = np.isfinite(st)
    water = (st < thr) & valid
    layers = []
    for w, v in zip(water, valid):
        a = w.astype(np.uint8)
        a[~v] = NODATA
        layers.append(a)
    e03.write_stack(C.NISAR / "water_stack.tif", layers, [f"water_{d}" for d in dates], transform, crs)

    # 3. The monsoon, pass by pass
    corr = corridor(cls)
    dist = ndimage.distance_transform_edt(~corr) * px
    belt = dist <= RIVER_BELT_M
    dry_land = np.isin(cls, (1, 2))
    timeline = pd.DataFrame({
        "date": dates,
        "water_ha": [float((w & belt).sum()) * px_ha for w in water],
        "dry_season_land_under_water_ha": [float((w & belt & dry_land).sum()) * px_ha for w in water],
        "valid_fraction": [float((v & belt).sum() / belt.sum()) for v in valid],
    }).round(3)
    timeline.to_csv(C.NISAR / "timeline.csv", index=False)
    print(timeline.to_string(index=False))

    # 4. Erosion of monsoon 2026
    if len(dates) < 2:
        raise SystemExit("Only one NISAR pass on disk; erosion needs at least two (run 08_nisar_fetch.py)")
    n = min(C.NISAR_AFTER_PASSES, len(dates) - 1)
    ok = valid[0] & valid[-n:].all(axis=0) & (cls != NODATA)
    before = dry_land & ~water[0]
    after = water[-n:].all(axis=0)
    eroded = ok & before & after & (dist <= C.NISAR_MAX_RETREAT_M)
    eroded = e03.drop_small(eroded, C.MIN_PATCH_PX)
    eroded = e03.touching(eroded, corr)
    out = np.zeros(cls.shape, dtype=np.uint8)
    out[eroded] = 1
    out[eroded & (cls == 2)] = 2
    out[~ok] = NODATA
    e03.write_stack(C.NISAR / "eroded_2026.tif", [out], ["monsoon_2026_nisar"], transform, crs)

    recs = [{"monsoon": 2026, "kind": "settlement" if v == 2 else "land", "after": dates[-1], "geometry": shape(g)}
            for g, v in shapes(out, mask=(out == 1) | (out == 2), transform=transform)]
    gdf = gpd.GeoDataFrame(pd.DataFrame(recs, columns=["monsoon", "kind", "after", "geometry"]), geometry="geometry",
                           crs=crs)
    gdf["area_ha"] = gdf.geometry.area / 1e4
    gdf.to_file(C.NISAR / "erosion_2026.gpkg", layer="erosion", driver="GPKG")
    hist = pd.read_csv(C.PROCESSED / "erosion_summary.csv")
    total = float(eroded.sum()) * px_ha
    print(f"\nNISAR erosion, monsoon 2026 (dry season 2026 + {dates[0]} -> {', '.join(dates[-n:])}): {total:.0f} ha "
          f"(settlement {float((out == 2).sum()) * px_ha:.1f} ha). "
          f"Sentinel-1 2015-2025: mean {hist.eroded_ha.mean():.0f}, range {hist.eroded_ha.min():.0f}-{hist.eroded_ha.max():.0f} ha/yr")

    # 5. Per bank stretch, next to the model's forecast
    seg = segment_check(eroded, cls, transform, px_ha)
    seg.to_csv(C.NISAR / "segments_2026.csv", index=False)
    print(f"Stretches with >= {C.EROSION_TARGET_HA:g} ha NISAR erosion: {seg.nisar_major.sum()} of {len(seg)}")
    print(seg.groupby("risk_class").agg(stretches=("segment", "size"), major=("nisar_major", "sum"),
                                         eroded_ha=("nisar_eroded_ha", "sum")).round(1).to_string())


if __name__ == "__main__":
    main()
