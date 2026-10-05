import ee

import config as C
import gee_common as G


def mask_s2(img):
    scl = img.select("SCL")
    bad = scl.eq(0).Or(scl.eq(1)).Or(scl.eq(3)).Or(scl.eq(8)).Or(scl.eq(9)).Or(scl.eq(10))
    return img.updateMask(bad.Not())


def veg_mask(end_year):
    start, end = G.dry_season(end_year)
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(G.aoi())
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(mask_s2)
        .map(lambda i: i.normalizedDifference(["B8", "B4"]).rename("ndvi"))
    )
    return s2.reduce(ee.Reducer.percentile([90])).gt(C.NDVI_VEG).rename("veg")


def scores(rows, n):
    """Overall accuracy and balanced accuracy (mean of land recall and sand/water recall)."""
    acc = sum(1 for r in rows if r[n] == r["veg"]) / len(rows)
    veg = [r for r in rows if r["veg"] == 1]
    bare = [r for r in rows if r["veg"] == 0]
    rec_land = sum(1 for r in veg if r[n] == 1) / max(len(veg), 1)
    rec_bare = sum(1 for r in bare if r[n] == 0) / max(len(bare), 1)
    return acc, (rec_land + rec_bare) / 2


def main():
    G.init()
    print(f"Region {C.REGION}, box {C.AOI_BBOX}")
    zone = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").gt(0)
    points = ee.FeatureCollection.randomPoints(G.aoi(), C.VALIDATION_POINTS, 42)
    names = [f"t{i}" for i in range(len(C.VALIDATION_THRESHOLDS))]
    summary = {t: [] for t in C.VALIDATION_THRESHOLDS}

    for year in C.VALIDATION_YEARS:
        counts = G.image_counts(year)
        if counts["ascending"] == 0:
            print(f"{year - 1}/{year}: no ascending images, skipped")
            continue
        db = G.land_db(year)
        bands = [db.gte(t).rename(n) for t, n in zip(C.VALIDATION_THRESHOLDS, names)]
        stack = ee.Image.cat(bands + [veg_mask(year)]).updateMask(zone)
        rows = stack.sampleRegions(collection=points, scale=C.SCALE_NATIVE, geometries=False, tileScale=4)
        rows = [f["properties"] for f in rows.getInfo()["features"]]
        rows = [r for r in rows if "veg" in r and all(n in r for n in names)]
        if not rows:
            print(f"{year - 1}/{year}: no valid samples")
            continue
        veg_share = sum(r["veg"] for r in rows) / len(rows)
        line = [f"{year - 1}/{year}: images={counts['ascending']}, samples={len(rows)}, vegetated={veg_share:.0%}"]
        for t, n in zip(C.VALIDATION_THRESHOLDS, names):
            acc, bal = scores(rows, n)
            summary[t].append((acc, bal))
            line.append(f"{t:+.1f}dB={acc:.3f}/{bal:.3f}")
        print("  ".join(line), flush=True)

    print("\nMean across years (accuracy / balanced accuracy):")
    best = None
    for t, vals in summary.items():
        if vals:
            acc = sum(v[0] for v in vals) / len(vals)
            bal = sum(v[1] for v in vals) / len(vals)
            print(f"  {t:+.1f} dB: {acc:.3f} / {bal:.3f}")
            if best is None or bal > best[1]:
                best = (t, bal)
    if best:
        print(f"\nBest threshold (balanced accuracy): {best[0]:+.1f} dB ({best[1]:.3f})")
        print(f"Current LAND_THRESHOLD_DB in config.py: {C.LAND_THRESHOLD_DB:+.1f} dB")


if __name__ == "__main__":
    main()
