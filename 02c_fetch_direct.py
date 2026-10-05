"""Download layers straight from Earth Engine into data/<region>/raw, without Google Drive.

Same images and the same grid as the Drive exports of 02_gee_export.py / 02b_gee_extras.py
(EPSG:32645, origin snapped to the pixel size), fetched in tiles with ee.data.computePixels.

  python 02c_fetch_direct.py class --years 2015 2016      # class_YYYY.tif  (Step 3)
  python 02c_fetch_direct.py context                       # buildings.csv + worldpop_2020.tif (Step 3)
  python 02c_fetch_direct.py extras                        # static_layers.tif + dw_water_YYYY.tif (Step 4)
"""
import argparse
import importlib
import math
import time
from concurrent.futures import ThreadPoolExecutor

import ee
import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from rasterio.transform import Affine

import config as C
import gee_common as G

export = importlib.import_module("02_gee_export")
extras = importlib.import_module("02b_gee_extras")

TILE = 512
WORKERS = 8
RETRIES = 4


def region_grid(scale):
    """Grid that Earth Engine uses for an export of AOI_BBOX with crs=CRS and this scale."""
    w, s, e, n = Transformer.from_crs("EPSG:4326", C.CRS, always_xy=True).transform_bounds(*C.AOI_BBOX)
    x0, y0 = math.floor(w / scale) * scale, math.ceil(n / scale) * scale
    width = math.ceil((e - x0) / scale)
    height = math.ceil((y0 - math.floor(s / scale) * scale) / scale)
    return Affine(scale, 0, x0, 0, -scale, y0), width, height


def fetch_tile(img, transform, col, row, w, h):
    grid = {
        "dimensions": {"width": w, "height": h},
        "affineTransform": {
            "scaleX": transform.a,
            "shearX": 0,
            "translateX": transform.c + col * transform.a,
            "shearY": 0,
            "scaleY": transform.e,
            "translateY": transform.f + row * transform.e,
        },
        "crsCode": C.CRS,
    }
    for attempt in range(RETRIES):
        try:
            return ee.data.computePixels({"expression": img, "fileFormat": "NUMPY_NDARRAY", "grid": grid})
        except ee.EEException as err:
            if attempt == RETRIES - 1:
                raise
            print(f"  tile ({col},{row}) retry {attempt + 1}: {err}", flush=True)
            time.sleep(5 * (attempt + 1))


def fetch_image(img, name, scale, dtype, nodata):
    transform, width, height = region_grid(scale)
    bands = img.bandNames().getInfo()
    out = np.full((len(bands), height, width), nodata, dtype=dtype)
    jobs = [(c, r, min(TILE, width - c), min(TILE, height - r)) for r in range(0, height, TILE) for c in range(0, width, TILE)]
    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = {pool.submit(fetch_tile, img, transform, c, r, w, h): (c, r, w, h) for c, r, w, h in jobs}
        for f, (c, r, w, h) in futures.items():
            arr = f.result()
            for i, b in enumerate(bands):
                out[i, r : r + h, c : c + w] = arr[b]
    path = C.RAW / f"{name}.tif"
    profile = dict(
        driver="GTiff", width=width, height=height, count=len(bands), dtype=dtype, crs=C.CRS,
        transform=transform, nodata=nodata, compress="deflate", tiled=True,
    )
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(out)
        for i, b in enumerate(bands, start=1):
            dst.set_band_description(i, b)
    print(f"Wrote {path.name}: {width}x{height}, {len(jobs)} tiles, {time.time() - t0:.0f} s", flush=True)


def fetch_buildings(splits=12):
    """Same content as the Drive buildings.csv. Polygons are fetched per sub-box and their centroids
    computed locally: the server-side centroid map exceeds Earth Engine's interactive memory limit."""
    w, s, e, n = C.AOI_BBOX
    xs, ys = np.linspace(w, e, splits + 1), np.linspace(s, n, splits + 1)
    boxes = [[xs[i], ys[j], xs[i + 1], ys[j + 1]] for i in range(splits) for j in range(splits)]
    fc = (
        ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons")
        .filter(ee.Filter.gte("confidence", C.BUILDING_CONFIDENCE))
        .select(["area_in_meters", "confidence"])
    )

    def part(b):
        for attempt in range(RETRIES):
            try:
                gdf = ee.data.computeFeatures(
                    {"expression": fc.filterBounds(ee.Geometry.Rectangle(b, proj="EPSG:4326", geodesic=False)),
                     "fileFormat": "GEOPANDAS_GEODATAFRAME"}
                )
                break
            except ee.EEException as err:
                if attempt == RETRIES - 1:
                    raise
                print(f"  buildings box {b} retry {attempt + 1}: {err}", flush=True)
                time.sleep(5 * (attempt + 1))
        if gdf.empty:
            return pd.DataFrame(columns=["lon", "lat", "area_m2", "confidence"])
        cen = gdf.set_crs(4326, allow_override=True).to_crs(C.CRS).centroid.to_crs(4326)
        df = pd.DataFrame({"lon": cen.x, "lat": cen.y, "area_m2": gdf.area_in_meters, "confidence": gdf.confidence})
        return df[(df.lon >= b[0]) & (df.lon < b[2]) & (df.lat >= b[1]) & (df.lat < b[3])]

    with ThreadPoolExecutor(WORKERS) as pool:
        df = pd.concat(list(pool.map(part, boxes)), ignore_index=True)
    df.to_csv(C.RAW / "buildings.csv", index=False)
    print(f"Wrote buildings.csv: {len(df)} buildings", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", nargs="+", choices=("class", "context", "extras"))
    ap.add_argument("--years", nargs="*", type=int)
    a = ap.parse_args()

    G.init()
    C.RAW.mkdir(parents=True, exist_ok=True)
    print(f"Region {C.REGION}, box {C.AOI_BBOX}, threshold {C.LAND_THRESHOLD_DB} dB -> {C.RAW}", flush=True)
    years = a.years or list(range(C.FIRST_DRY_SEASON, C.LAST_DRY_SEASON + 1))

    if "context" in a.what:
        fetch_buildings()
        fetch_image(export.worldpop_image().unmask(-1), f"worldpop_{C.WORLDPOP_YEAR}", 100, "float32", -1)
    if "extras" in a.what:
        fetch_image(extras.static_layers().unmask(-9999), "static_layers", C.SCALE_EXPORT, "float32", -9999)
        for y in years:
            if y < 2016 or extras.dw_collection(y).size().getInfo() == 0:
                print(f"{y}: no Dynamic World images, skipped")
                continue
            fetch_image(extras.dw_water(y), f"dw_water_{y}", C.SCALE_EXPORT, "uint8", 255)
    if "class" in a.what:
        for y in years:
            counts = G.image_counts(y)
            if counts["ascending"] == 0 or counts["descending"] == 0:
                raise SystemExit(f"No images for {y - 1}/{y}: {counts}")
            fetch_image(G.class_image(y), f"class_{y}", C.SCALE_EXPORT, "uint8", 255)


if __name__ == "__main__":
    main()
