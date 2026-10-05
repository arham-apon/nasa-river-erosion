import warnings

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask as rio_mask
from rasterio.warp import Resampling, reproject
from scipy import ndimage
from shapely.geometry import LineString, box

import config as C

NODATA = 255
SIDES = ("west", "east")
SMOOTH_ROWS = 11  # rolling median window along the bank (11 rows = 220 m at 20 m)
MAX_JUMP_M = 1000  # bank moves larger than this in one monsoon are treated as tracing errors
STRIP_M = 500  # width of the riverward / landward strips for the Step 4 layers


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
    filled = ndimage.binary_fill_holes(labels == sizes.argmax())
    if C.CORRIDOR_OPENING_ITER:
        # Narrow tributaries joined to the main belt would otherwise pull the bank sideways
        opened = ndimage.binary_opening(filled, structure=np.ones((3, 3)), iterations=C.CORRIDOR_OPENING_ITER)
        labels, n = ndimage.label(opened)
        if n:
            sizes = np.bincount(labels.ravel())
            sizes[0] = 0
            filled = labels == sizes.argmax()
    return filled


def bank_cols(corr):
    has = corr.any(axis=1)
    west = np.where(has, corr.argmax(axis=1), -1)
    east = np.where(has, corr.shape[1] - 1 - corr[:, ::-1].argmax(axis=1), -1)
    return {"west": smooth_cols(west), "east": smooth_cols(east)}


def smooth_cols(cols):
    """Rolling median of the bank column along the river; rows without a bank stay -1."""
    v = pd.Series(np.where(cols >= 0, cols, np.nan), dtype=float)
    sm = v.rolling(SMOOTH_ROWS, center=True, min_periods=SMOOTH_ROWS // 2 + 1).median().to_numpy()
    return np.where((cols >= 0) & np.isfinite(sm), np.round(sm), -1).astype(int)


def strip_median(values, cols, side, strip_px, toward):
    """Per row, median of values in a strip of strip_px pixels next to the bank, riverward or landward."""
    h, w = values.shape
    offs = np.arange(1, strip_px + 1)
    riverward_is_right = side == "west"
    right = riverward_is_right if toward == "river" else not riverward_is_right
    idx = cols[:, None] + (offs if right else -offs)[None, :]
    ok = (idx >= 0) & (idx < w) & (cols[:, None] >= 0)
    vals = np.take_along_axis(values, np.clip(idx, 0, w - 1), axis=1).astype("float32")
    vals[~ok] = np.nan
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmedian(vals, axis=1)


def load_on_grid(path, band, shape, transform, crs, nodata=None):
    out = np.full(shape, np.nan, dtype="float32")
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, band),
            destination=out,
            dst_transform=transform,
            dst_crs=crs,
            resampling=Resampling.nearest,
            src_nodata=nodata,
            dst_nodata=np.nan,
        )
    return out


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
    """Positive = the bank sticks out into the river compared with its neighbours (west: larger x, east: smaller x)."""
    sign = 1.0 if side == "west" else -1.0
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
    files = []
    for folder in (C.RAW, C.BOUNDARIES):
        for ext in ("shp", "geojson"):
            files += [f for f in folder.glob(f"geoBoundaries-BGD-ADM4*.{ext}") if "simplified" not in f.name.lower()]
    if not files:
        print(f"Union boundaries not found in {C.RAW} or {C.BOUNDARIES}; skipping union join")
        return None
    u = gpd.read_file(files[0], bbox=tuple(C.AOI_BBOX)).to_crs(crs)
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
                vals = np.ma.filled(data.astype("float64"), np.nan)
                out.append(float(np.nansum(np.where(vals > 0, vals, 0))))  # NaN (Drive) or -1 (direct) = no data
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

    strip_px = int(round(STRIP_M / px))
    shape = classes.shape[1:]
    static = C.RAW / "static_layers.tif"
    if static.exists():
        jrc = load_on_grid(static, 1, shape, transform, crs, nodata=-9999)
        hand = load_on_grid(static, 2, shape, transform, crs, nodata=-9999)
    else:
        print("static_layers.tif not found; skipping jrc_occ_* and hand_land_m")
        jrc = hand = None

    cols_by_year, records = {}, []
    for i, y in enumerate(dry_years):
        dw_path = C.RAW / f"dw_water_{y}.tif"
        dw = load_on_grid(dw_path, 1, shape, transform, crs, nodata=255) if dw_path.exists() else None
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
            nan = np.full(n_seg, np.nan)

            def strip(layer, toward):
                if layer is None:
                    return nan
                return seg_reduce(strip_median(layer, c, side, strip_px, toward), rows_per_seg, n_seg, "median")

            jrc_river, jrc_land, hand_land = strip(jrc, "river"), strip(jrc, "land"), strip(hand, "land")
            dw_river = strip(dw, "river")
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
                        "jrc_occ_river": jrc_river[s],
                        "jrc_occ_land": jrc_land[s],
                        "hand_land_m": hand_land[s],
                        "dw_water_river": dw_river[s],
                        "target_eroded_ha": ero_all[s] * px_ha,
                        "target_eroded_settlement_ha": ero_set[s] * px_ha,
                    }
                )
        print(f"Dry season {y}: median corridor width {np.nanmedian(width):.0f} m")

    df = pd.DataFrame(records).sort_values(["segment", "side", "year"]).reset_index(drop=True)
    g = df.groupby(["segment", "side"])
    next_x = g["bank_x"].shift(-1)
    df["target_retreat_m"] = np.where(df.side == "west", df.bank_x - next_x, next_x - df.bank_x)
    jumps = df.target_retreat_m.abs() > MAX_JUMP_M
    print(f"Max-jump rule: {int(jumps.sum())} of {int(df.target_retreat_m.notna().sum())} bank moves > {MAX_JUMP_M} m set to empty")
    df.loc[jumps, "target_retreat_m"] = np.nan
    g = df.groupby(["segment", "side"])
    df["dw_water_change"] = df.dw_water_river - g["dw_water_river"].shift(1)
    for lag in (1, 2, 3):
        df[f"eroded_ha_lag{lag}"] = g["target_eroded_ha"].shift(lag)
    for lag in (1, 2):
        df[f"retreat_m_lag{lag}"] = g["target_retreat_m"].shift(lag)
    df["eroded_settlement_ha_lag1"] = g["target_eroded_settlement_ha"].shift(1)
    df["side_is_west"] = (df.side == "west").astype(int)
    df["target"] = np.where(df.target_eroded_ha.notna(), (df.target_eroded_ha >= C.EROSION_TARGET_HA).astype(float), np.nan)
    latest = dry_years[-1]
    df["split"] = np.where(df.year == latest, "forecast", "train")
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
