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


def main():
    G.init()
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
        line = [f"{year - 1}/{year}: images={counts['ascending']}, samples={len(rows)}"]
        for t, n in zip(C.VALIDATION_THRESHOLDS, names):
            acc = sum(1 for r in rows if r[n] == r["veg"]) / len(rows)
            summary[t].append(acc)
            line.append(f"{t:+.1f}dB={acc:.3f}")
        print("  ".join(line))

    print("\nMean accuracy across years:")
    best = None
    for t, accs in summary.items():
        if accs:
            mean = sum(accs) / len(accs)
            print(f"  {t:+.1f} dB: {mean:.3f}")
            if best is None or mean > best[1]:
                best = (t, mean)
    if best:
        print(f"\nBest threshold: {best[0]:+.1f} dB (accuracy {best[1]:.3f})")
        print(f"Current LAND_THRESHOLD_DB in config.py: {C.LAND_THRESHOLD_DB:+.1f} dB")


if __name__ == "__main__":
    main()
