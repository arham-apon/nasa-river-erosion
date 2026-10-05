import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import shapes
from rasterio.merge import merge
from scipy import ndimage
from shapely.geometry import shape

import config as C

NODATA = 255


def load_year(year):
    files = sorted(C.RAW.glob(f"class_{year}*.tif"))
    if not files:
        raise SystemExit(f"Missing class_{year}*.tif in {C.RAW}")
    srcs = [rasterio.open(f) for f in files]
    try:
        if len(srcs) == 1:
            arr, transform = srcs[0].read(1), srcs[0].transform
        else:
            mosaic, transform = merge(srcs, nodata=NODATA)
            arr = mosaic[0]
        return arr, transform, srcs[0].crs
    finally:
        for s in srcs:
            s.close()


def drop_small(mask, min_px):
    labels, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = np.bincount(labels.ravel())
    keep = sizes >= min_px
    keep[0] = False
    return keep[labels]


def write_stack(path, arrays, names, transform, crs):
    profile = {
        "driver": "GTiff",
        "height": arrays[0].shape[0],
        "width": arrays[0].shape[1],
        "count": len(arrays),
        "dtype": "uint8",
        "crs": crs,
        "transform": transform,
        "nodata": NODATA,
        "compress": "deflate",
        "tiled": True,
    }
    with rasterio.open(path, "w", **profile) as dst:
        for i, (a, n) in enumerate(zip(arrays, names), start=1):
            dst.write(a, i)
            dst.set_band_description(i, n)


def main():
    C.PROCESSED.mkdir(parents=True, exist_ok=True)
    years = list(range(C.FIRST_DRY_SEASON, C.LAST_DRY_SEASON + 1))

    classes, transform, crs = [], None, None
    for y in years:
        arr, t, c = load_year(y)
        if transform is None:
            transform, crs = t, c
        elif arr.shape != classes[0].shape or t != transform:
            raise SystemExit(f"class_{y} grid differs from class_{years[0]}; re-export with identical settings")
        classes.append(arr)
        print(f"Loaded class_{y}: {arr.shape}, land={np.mean(np.isin(arr, (1, 2))):.2%}, nodata={np.mean(arr == NODATA):.2%}")

    write_stack(C.PROCESSED / "class_stack.tif", classes, [f"dry_{y}" for y in years], transform, crs)

    px_ha = abs(transform.a * transform.e) / 1e4
    eroded_layers, records, summary = [], [], []
    for i, y in enumerate(years[:-1]):
        before, after = classes[i], classes[i + 1]
        valid = (before != NODATA) & (after != NODATA)
        eroded = valid & np.isin(before, (1, 2)) & (after == 0)
        eroded = drop_small(eroded, C.MIN_PATCH_PX)
        out = np.zeros(before.shape, dtype=np.uint8)
        out[eroded] = 1
        out[eroded & (before == 2)] = 2
        out[~valid] = NODATA
        eroded_layers.append(out)

        for geom, val in shapes(out, mask=(out == 1) | (out == 2), transform=transform):
            records.append({"monsoon": y, "kind": "settlement" if val == 2 else "land", "geometry": shape(geom)})
        summary.append(
            {
                "monsoon": y,
                "eroded_ha": float((out == 1).sum() + (out == 2).sum()) * px_ha,
                "eroded_settlement_ha": float((out == 2).sum()) * px_ha,
            }
        )
        print(f"Monsoon {y}: eroded {summary[-1]['eroded_ha']:.0f} ha (settlement {summary[-1]['eroded_settlement_ha']:.1f} ha)")

    write_stack(C.PROCESSED / "eroded_stack.tif", eroded_layers, [f"monsoon_{y}" for y in years[:-1]], transform, crs)

    gdf = gpd.GeoDataFrame(records, geometry="geometry", crs=crs)
    if len(gdf):
        gdf["area_ha"] = gdf.geometry.area / 1e4
    gdf.to_file(C.PROCESSED / "erosion_polygons.gpkg", layer="erosion", driver="GPKG")
    pd.DataFrame(summary).to_csv(C.PROCESSED / "erosion_summary.csv", index=False)
    print(f"\nWrote outputs to {C.PROCESSED}")


if __name__ == "__main__":
    main()
