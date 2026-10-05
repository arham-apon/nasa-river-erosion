import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask as rio_mask
from scipy import ndimage
from shapely.geometry import LineString, box

import config as C

NODATA = 255
SIDES = ("west", "east")


def read_stack(path):
    with rasterio.open(path) as src:
        years = [int(d.split("_")[1]) for d in src.descriptions]
        return src.read(), years, src.transform, src.crs


def corridor(cls):
    water = cls == 0
    closed = ndimage.binary_closing(water, structure=np.ones((3, 3)), iterations=C.CORRIDOR_CLOSING_ITER)
    labels, n = ndimage.label(closed)
    if n == 0:
        return np.zeros_like(water)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return ndimage.binary_fill_holes(labels == sizes.argmax())


def bank_cols(corr):
    has = corr.any(axis=1)
    west = np.where(has, corr.argmax(axis=1), -1)
    east = np.where(has, corr.shape[1] - 1 - corr[:, ::-1].argmax(axis=1), -1)
    return {"west": west, "east": east}


def window_sum(mask, cols, side, buf_px, tol_px):
    h, w = mask.shape
    cs = np.zeros((h, w + 1), dtype=np.int64)
    cs[:, 1:] = np.cumsum(mask, axis=1)
    if side == "west":
        a, b = cols - buf_px, cols + tol_px + 1
    else:
        a, b = cols - tol_px, cols + buf_px + 1
    a, b = np.clip(a, 0, w), np.clip(b, 0, w)
    rows = np.arange(h)
    out = (cs[rows, b] - cs[rows, a]).astype(float)
    out[cols < 0] = np.nan
    return out


def landward_sum(mask, cols, side, buf_px):
    h, w = mask.shape
    cs = np.zeros((h, w + 1), dtype=np.int64)
    cs[:, 1:] = np.cumsum(mask, axis=1)
    if side == "west":
        a, b = cols - buf_px, cols
    else:
        a, b = cols + 1, cols + buf_px + 1
    a, b = np.clip(a, 0, w), np.clip(b, 0, w)
    rows = np.arange(h)
    out = (cs[rows, b] - cs[rows, a]).astype(float)
    out[cols < 0] = np.nan
    return out


def seg_reduce(values, rows_per_seg, n_seg, how):
    v = values[: n_seg * rows_per_seg].reshape(n_seg, rows_per_seg)
    valid = np.isfinite(v)
    frac = valid.mean(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        out = np.nanmedian(v, axis=1) if how == "median" else np.nansum(v, axis=1)
    out[frac < C.MIN_VALID_ROW_FRACTION] = np.nan
    return out


def col_to_x(cols, transform):
    x = transform.c + (cols + 0.5) * transform.a
    return np.where(cols >= 0, x, np.nan)


def bulge(x, side):
    sign = -1.0 if side == "west" else 1.0
    out = np.full_like(x, np.nan)
    out[1:-1] = sign * (2 * x[1:-1] - x[:-2] - x[2:]) + 0.0
    return out


def bank_lines(cols_by_year, years, transform, crs, step=5):
    records = []
    for y in years:
        for side in SIDES:
            cols = cols_by_year[y][side]
            rows = np.arange(0, len(cols), step)
            rows = rows[cols[rows] >= 0]
            if len(rows) < 2:
                continue
            xs = col_to_x(cols[rows], transform)
            ys = transform.f + (rows + 0.5) * transform.e
            records.append({"dry_season": y, "side": side, "geometry": LineString(zip(xs, ys))})
    return gpd.GeoDataFrame(records, geometry="geometry", crs=crs)


def load_unions(crs):
    files = [f for f in C.RAW.glob("geoBoundaries-BGD-ADM4*.geojson") if "simplified" not in f.name.lower()]
    files += [f for f in C.RAW.glob("geoBoundaries-BGD-ADM4*.shp") if "simplified" not in f.name.lower()]
    if not files:
        print("Union boundaries not found in data/raw; skipping union join")
        return None
    u = gpd.read_file(files[0]).to_crs(crs)
    keep = [c for c in ("shapeName", "shapeID") if c in u.columns]
    return u[keep + ["geometry"]].rename(columns={"shapeName": "union_name", "shapeID": "union_id"})


def load_buildings(crs):
    path = C.RAW / "buildings.csv"
    if not path.exists():
        print("buildings.csv not found in data/raw; skipping building exposure")
        return None
    df = pd.read_csv(path)
    return gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat), crs="EPSG:4326").to_crs(crs)


def worldpop_sum(polys):
    files = sorted(C.RAW.glob(f"worldpop_{C.WORLDPOP_YEAR}*.tif"))
    if not files:
        print("WorldPop raster not found in data/raw; skipping population exposure")
        return None
    with rasterio.open(files[0]) as src:
        polys = polys.to_crs(src.crs)
        out = []
        for g in polys.geometry:
            try:
                data, _ = rio_mask(src, [g], crop=True, filled=False)
                out.append(float(np.ma.masked_less(data, 0).sum()))
            except ValueError:
                out.append(np.nan)
    return out


def main():
    classes, dry_years, transform, crs = read_stack(C.PROCESSED / "class_stack.tif")
    eroded, monsoon_years, _, _ = read_stack(C.PROCESSED / "eroded_stack.tif")
    px = abs(transform.a)
    px_ha = abs(transform.a * transform.e) / 1e4
    rows_per_seg = max(1, int(round(C.SEGMENT_LENGTH_M / abs(transform.e))))
    n_seg = classes.shape[1] // rows_per_seg
    buf_px = int(round(C.BANK_BUFFER_M / px))
    tol_px = int(round(C.BANK_TOLERANCE_M / px))

    seg_rows = np.arange(n_seg)
    y_top = transform.f + seg_rows * rows_per_seg * transform.e
    y_bot = y_top + rows_per_seg * transform.e
    y_mid = (y_top + y_bot) / 2

    cols_by_year, records = {}, []
    for i, y in enumerate(dry_years):
        cls = classes[i]
        corr = corridor(cls)
        cols = bank_cols(corr)
        cols_by_year[y] = cols
        width = seg_reduce(
            np.where((cols["west"] >= 0) & (cols["east"] >= 0), (cols["east"] - cols["west"]) * px, np.nan),
            rows_per_seg,
            n_seg,
            "median",
        )
        settle = cls == 2
        ero = eroded[monsoon_years.index(y)] if y in monsoon_years else None
        for side in SIDES:
            c = cols[side]
            x = seg_reduce(col_to_x(c, transform), rows_per_seg, n_seg, "median")
            settle_px = seg_reduce(landward_sum(settle, c, side, buf_px), rows_per_seg, n_seg, "sum")
            if ero is not None:
                ero_all = seg_reduce(window_sum(ero > 0, c, side, buf_px, tol_px), rows_per_seg, n_seg, "sum")
                ero_set = seg_reduce(window_sum(ero == 2, c, side, buf_px, tol_px), rows_per_seg, n_seg, "sum")
            else:
                ero_all = ero_set = np.full(n_seg, np.nan)
            b = bulge(x, side)
            for s in range(n_seg):
                records.append(
                    {
                        "segment": s,
                        "side": side,
                        "year": y,
                        "y_mid": y_mid[s],
                        "y_top": y_top[s],
                        "y_bot": y_bot[s],
                        "bank_x": x[s],
                        "corridor_width_m": width[s],
                        "bulge_m": b[s],
                        "landward_settlement_ha": settle_px[s] * px_ha,
                        "target_eroded_ha": ero_all[s] * px_ha,
                        "target_eroded_settlement_ha": ero_set[s] * px_ha,
                    }
                )
        print(f"Dry season {y}: median corridor width {np.nanmedian(width):.0f} m")

    df = pd.DataFrame(records).sort_values(["segment", "side", "year"]).reset_index(drop=True)
    g = df.groupby(["segment", "side"])
    next_x = g["bank_x"].shift(-1)
    df["target_retreat_m"] = np.where(df.side == "west", df.bank_x - next_x, next_x - df.bank_x)
    g = df.groupby(["segment", "side"])
    for lag in (1, 2, 3):
        df[f"eroded_ha_lag{lag}"] = g["target_eroded_ha"].shift(lag)
    for lag in (1, 2):
        df[f"retreat_m_lag{lag}"] = g["target_retreat_m"].shift(lag)
    df["eroded_settlement_ha_lag1"] = g["target_eroded_settlement_ha"].shift(1)
    df["side_is_west"] = (df.side == "west").astype(int)
    df["target"] = np.where(df.target_eroded_ha.notna(), (df.target_eroded_ha >= C.EROSION_TARGET_HA).astype(float), np.nan)
    df["split"] = np.where(df.target_eroded_ha.isna(), "forecast", "train")

    latest = dry_years[-1]
    cur = df[df.year == latest].copy()
    cur["geometry"] = [
        box(r.bank_x - C.BANK_BUFFER_M, r.y_bot, r.bank_x, r.y_top)
        if r.side == "west"
        else box(r.bank_x, r.y_bot, r.bank_x + C.BANK_BUFFER_M, r.y_top)
        for r in cur.itertuples()
    ]
    cur = cur[cur.bank_x.notna()]
    zones = gpd.GeoDataFrame(cur[["segment", "side", "geometry"]], geometry="geometry", crs=crs)

    bld = load_buildings(crs)
    if bld is not None:
        j = gpd.sjoin(bld, zones, predicate="within", how="inner")
        agg = j.groupby(["segment", "side"]).agg(buildings=("area_m2", "size"), building_area_m2=("area_m2", "sum"))
        zones = zones.merge(agg.reset_index(), on=["segment", "side"], how="left").fillna(
            {"buildings": 0, "building_area_m2": 0}
        )
    pop = worldpop_sum(zones)
    if pop is not None:
        zones["population"] = pop

    unions = load_unions(crs)
    if unions is not None:
        pts = zones[["segment", "side"]].copy()
        pts = gpd.GeoDataFrame(pts, geometry=zones.geometry.centroid, crs=crs)
        j = gpd.sjoin_nearest(pts, unions, how="left").drop_duplicates(["segment", "side"])
        zones = zones.merge(j.drop(columns=["geometry", "index_right"]), on=["segment", "side"], how="left")

    static_cols = [c for c in zones.columns if c not in ("geometry",)]
    df = df.merge(zones[static_cols], on=["segment", "side"], how="left")

    C.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(C.PROCESSED / "training_table.csv", index=False)
    seg_out = zones.merge(df[df.year == latest].drop(columns=[c for c in static_cols if c not in ("segment", "side")]), on=["segment", "side"])
    seg_out.to_file(C.PROCESSED / "segments.gpkg", layer=f"segments_{latest}", driver="GPKG")
    bank_lines(cols_by_year, dry_years, transform, crs).to_file(C.PROCESSED / "banklines.gpkg", layer="banklines", driver="GPKG")

    tr = df[df.split == "train"]
    print(f"\nTraining rows: {len(tr)} (positives: {int(tr.target.sum())}, rate {tr.target.mean():.1%})")
    print(f"Forecast rows (monsoon {latest}): {int((df.split == 'forecast').sum())}")
    print(f"Wrote training_table.csv, segments.gpkg, banklines.gpkg to {C.PROCESSED}")


if __name__ == "__main__":
    main()
