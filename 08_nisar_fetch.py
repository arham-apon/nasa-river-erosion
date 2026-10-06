"""Step 13: Fetch NISAR L-band GCOV backscatter for both regions, cut to each region's class-map grid.

Each GCOV file is 2-9 GB. Only the HDF5 chunks that overlap a region are downloaded (byte-range requests,
in parallel), then averaged from 10 m onto the 20 m Sentinel-1 class grid. A few hundred MB per pass.

Needs EARTHDATA_TOKEN in .env (or as an environment variable). Safe to stop at any time and re-run: finished passes are skipped.
Output: data/<region>/nisar/gcov_<YYYYMMDD>.tif (bands hh_db, hv_db; gamma0 dB; NaN = no data),
        data/nisar_scenes.csv (the passes used).
"""
import os
import re
import zlib

import asf_search as asf
import fsspec
import h5py
import numpy as np
import pandas as pd
import rasterio
from affine import Affine
from rasterio.warp import Resampling, reproject, transform_bounds
from shapely.geometry import box

import config as C

GRID = "science/LSAR/GCOV/grids/frequencyA"
CHUNK_BATCH = 32  # byte ranges fetched in parallel per batch
MARGIN_M = 200


def token():
    tok = os.environ.get("EARTHDATA_TOKEN")
    env = C.ROOT / ".env"
    if not tok and env.exists():
        m = re.search(r"^\s*EARTHDATA_TOKEN\s*=\s*['\"]?([^'\"\s]+)", env.read_text(encoding="utf-8-sig"), re.M)
        tok = m.group(1) if m else None
    if not tok:
        raise SystemExit("Set EARTHDATA_TOKEN in .env (https://urs.earthdata.nasa.gov -> Generate Token)")
    return tok


def search():
    boxes = [C.REGIONS[r]["bbox"] for r in C.REGIONS]
    aoi = box(min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    res = asf.search(dataset=asf.DATASET.NISAR_SCIENCE_PRODUCTS, processingLevel="GCOV",
                     intersectsWith=aoi.wkt, start=C.NISAR_START)
    rows = []
    for r in res:
        p = r.properties
        if (p["pathNumber"], p["flightDirection"], p["frameNumber"]) != (C.NISAR_TRACK, C.NISAR_DIRECTION, C.NISAR_FRAME):
            continue
        rows.append({"date": p["startTime"][:10], "granule": p["fileID"], "url": p["url"],
                     "urgent": "_UR_" in p["fileID"]})
    if not rows:
        raise SystemExit("No NISAR GCOV passes found for the configured track/frame")
    # One pass per date: the standard (non-urgent) product, latest version
    df = (pd.DataFrame(rows).sort_values(["date", "urgent", "granule"], ascending=[True, True, False])
          .drop_duplicates("date").drop(columns="urgent").reset_index(drop=True))
    df.to_csv(C.ROOT / "data" / "nisar_scenes.csv", index=False)
    return df


def class_grid(region):
    with rasterio.open(C.ROOT / "data" / region / "raw" / f"class_{C.LAST_DRY_SEASON}.tif") as src:
        return src.crs, src.transform, src.shape, src.bounds


def read_window(fs, url, ds, r0, r1, c0, c1):
    """Read ds[r0:r1, c0:c1] by fetching only the chunks it needs (HDF5 shuffle + gzip filters)."""
    ch, cw = ds.chunks
    itemsize = ds.dtype.itemsize
    out = np.full((r1 - r0, c1 - c0), np.nan if ds.dtype.kind == "f" else 255, dtype=ds.dtype)
    jobs = []
    for cr in range(r0 // ch * ch, r1, ch):
        for cc in range(c0 // cw * cw, c1, cw):
            info = ds.id.get_chunk_info_by_coord((cr, cc))
            if info.byte_offset is not None and info.size:
                jobs.append((cr, cc, info.byte_offset, info.size))
    for i in range(0, len(jobs), CHUNK_BATCH):
        batch = jobs[i:i + CHUNK_BATCH]
        blobs = fs.cat_ranges([url] * len(batch), [j[2] for j in batch], [j[2] + j[3] for j in batch])
        for (cr, cc, _, _), blob in zip(batch, blobs):
            raw = np.frombuffer(zlib.decompress(blob), dtype=np.uint8)
            if ds.shuffle:
                raw = raw.reshape(itemsize, -1).T.reshape(-1)
            tile = raw.view(ds.dtype).reshape(ch, cw)
            a0, a1 = max(cr, r0), min(cr + ch, r1)
            b0, b1 = max(cc, c0), min(cc + cw, c1)
            out[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = tile[a0 - cr:a1 - cr, b0 - cc:b1 - cc]
    return out


def fetch_scene(fs, row, regions):
    with h5py.File(fs.open(row.url, "rb", block_size=2**20, cache_type="bytes"), "r") as h:
        g = h[GRID]
        epsg = int(g["projection"][()])
        x, y = g["xCoordinates"][:], g["yCoordinates"][:]
        dx, dy = float(x[1] - x[0]), float(y[1] - y[0])
        for region, path in regions:
            crs, transform, shape, bounds = class_grid(region)
            L, B, R, T = transform_bounds(crs, f"EPSG:{epsg}", *bounds)
            c0 = max(int(np.searchsorted(x, L - MARGIN_M)), 0)
            c1 = min(int(np.searchsorted(x, R + MARGIN_M)), len(x))
            r0 = max(int(np.searchsorted(-y, -(T + MARGIN_M))), 0)
            r1 = min(int(np.searchsorted(-y, -(B - MARGIN_M))), len(y))
            src_t = Affine(dx, 0, x[c0] - dx / 2, 0, dy, y[r0] - dy / 2)
            m = read_window(fs, row.url, g["mask"], r0, r1, c0, c1)
            valid = (m > 0) & (m < 255)  # mask = subswath number of fully focused samples; 0 invalid, 255 fill
            bands = []
            for pol in ("HHHH", "HVHV"):
                a = read_window(fs, row.url, g[pol], r0, r1, c0, c1)
                a[~valid | ~(a > 0)] = np.nan
                dst = np.full(shape, np.nan, dtype="float32")
                reproject(a, dst, src_transform=src_t, src_crs=f"EPSG:{epsg}", dst_transform=transform, dst_crs=crs,
                          resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
                with np.errstate(divide="ignore", invalid="ignore"):
                    bands.append((10 * np.log10(dst)).astype("float32"))
            profile = {"driver": "GTiff", "height": shape[0], "width": shape[1], "count": 2, "dtype": "float32",
                       "crs": crs, "transform": transform, "nodata": np.nan, "compress": "deflate",
                       "predictor": 3, "tiled": True}
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.stem + ".part.tif")  # renamed only when complete, so a shutdown leaves no half file
            with rasterio.open(tmp, "w", **profile) as dst:
                for i, (b, n) in enumerate(zip(bands, ("hh_db", "hv_db")), start=1):
                    dst.write(b, i)
                    dst.set_band_description(i, n)
                dst.update_tags(granule=row.granule, date=row.date)
            os.replace(tmp, path)
            print(f"  {region}: {path.name}  valid {np.isfinite(bands[0]).mean():.0%}", flush=True)


def main():
    scenes = search()
    print(f"{len(scenes)} NISAR passes on track {C.NISAR_TRACK} frame {C.NISAR_FRAME}: "
          f"{scenes.date.iloc[0]} to {scenes.date.iloc[-1]}", flush=True)
    fs = fsspec.filesystem("https", client_kwargs={"headers": {"Authorization": f"Bearer {token()}"}})
    for row in scenes.itertuples():
        todo = [(r, C.ROOT / "data" / r / "nisar" / f"gcov_{row.date.replace('-', '')}.tif") for r in C.REGIONS]
        todo = [(r, p) for r, p in todo if not p.exists()]
        if not todo:
            print(f"{row.date}: already on disk")
            continue
        print(f"{row.date}: {row.granule}", flush=True)
        fetch_scene(fs, row, todo)


if __name__ == "__main__":
    main()
