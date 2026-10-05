"""Step 7 sanity checks for one region (CEW_REGION).

Writes to data/<region>/checks/:
  quicklook_<year>.png        class map of one dry season + the erosion of the monsoon after it
  check_<region>.kml          20 random erosion patches (> 2 ha) for Google Earth Pro (doc 7.2)
  optical_check.csv           the same 20 patches checked against Sentinel-2 vegetation before/after
  bank_erosion_summary.csv    erosion near the main banks per monsoon (needs 04_features.py output)
"""
import importlib

import ee
import geopandas as gpd
import matplotlib
import numpy as np
import pandas as pd
import rasterio

import config as C
import gee_common as G

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import ListedColormap  # noqa: E402

CHECKS = C.DATA / "checks"
N_PATCHES = 20
FIRST_S2_MONSOON = 2018  # Sentinel-2 surface reflectance starts 2017, so dry season 2018 is the first full one
veg_mask = importlib.import_module("01_validate_threshold").veg_mask


def quicklook(year):
    with rasterio.open(C.PROCESSED / "class_stack.tif") as src:
        cls = src.read(list(src.descriptions).index(f"dry_{year}") + 1)
    with rasterio.open(C.PROCESSED / "eroded_stack.tif") as src:
        ero = src.read(list(src.descriptions).index(f"monsoon_{year}") + 1)
    fig, axes = plt.subplots(1, 2, figsize=(12, 12 * cls.shape[0] / cls.shape[1] / 2 + 1))
    axes[0].imshow(np.where(cls == 255, 3, cls), cmap=ListedColormap(["#2b6cb0", "#5aa84f", "#e53e3e", "white"]),
                   vmin=0, vmax=3, interpolation="nearest")
    axes[0].set_title(f"{C.REGION} dry season {year}: blue sand/water, green land, red settlement")
    axes[1].imshow(cls == 0, cmap=ListedColormap(["#f0f0f0", "#a0c4e8"]), interpolation="nearest")
    rgba = np.zeros(ero.shape + (4,))
    rgba[ero == 1] = (0.9, 0.5, 0.0, 1)
    rgba[ero == 2] = (0.8, 0.0, 0.0, 1)
    axes[1].imshow(rgba, interpolation="nearest")
    axes[1].set_title(f"erosion in monsoon {year}: orange land, red settlement")
    for a in axes:
        a.set_xticks([])
        a.set_yticks([])
    fig.tight_layout()
    fig.savefig(CHECKS / f"quicklook_{year}.png", dpi=110)
    plt.close(fig)


def bankline_plot(years=(2018, 2020, 2024)):
    path = C.PROCESSED / "banklines.gpkg"
    if not path.exists():
        return
    b = gpd.read_file(path)
    with rasterio.open(C.PROCESSED / "class_stack.tif") as src:
        e, desc = src.bounds, list(src.descriptions)
        fig, axes = plt.subplots(1, len(years), figsize=(6 * len(years), 6 * (e.top - e.bottom) / (e.right - e.left) + 1))
        for ax, y in zip(axes, years):
            cls = src.read(desc.index(f"dry_{y}") + 1)
            ax.imshow(cls == 0, cmap=ListedColormap(["#e8e8e8", "#7fb0e0"]), extent=(e.left, e.right, e.bottom, e.top))
            bb = b[b.dry_season == y]
            bb[bb.side == "west"].plot(ax=ax, color="red", lw=1.2)
            bb[bb.side == "east"].plot(ax=ax, color="darkgreen", lw=1.2)
            ax.set_title(f"{C.REGION} {y}: west bank red, east bank green")
            ax.set_xticks([])
            ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(CHECKS / "banklines.png", dpi=90)
    plt.close(fig)


def sample_patches():
    g = gpd.read_file(C.PROCESSED / "erosion_polygons.gpkg")
    g = g[(g.area_ha > 2) & (g.monsoon >= FIRST_S2_MONSOON) & (g.monsoon < C.LAST_DRY_SEASON)]
    return g.sample(min(N_PATCHES, len(g)), random_state=1).reset_index(drop=True)


def optical_check(patches):
    """Share of each patch that Sentinel-2 calls vegetated in the dry season before and after the monsoon."""
    G.init()
    pts = patches.to_crs(4326)
    rows = []
    for y in sorted(pts.monsoon.unique()):
        sub = pts[pts.monsoon == y]
        fc = ee.FeatureCollection(
            [ee.Feature(ee.Geometry(geom.__geo_interface__), {"i": int(i)}) for i, geom in zip(sub.index, sub.geometry)]
        )
        img = veg_mask(int(y)).rename("veg_before").addBands(veg_mask(int(y) + 1).rename("veg_after"))
        res = img.unmask(0).reduceRegions(fc, ee.Reducer.mean(), scale=10, tileScale=4).getInfo()
        rows += [f["properties"] for f in res["features"]]
    r = pd.DataFrame(rows).set_index("i")
    out = patches.drop(columns="geometry").join(r)
    out["confirmed"] = (out.veg_before >= 0.5) & (out.veg_after < 0.5)
    return out


def bank_summary():
    path = C.PROCESSED / "training_table.csv"
    if not path.exists():
        print("training_table.csv not found; run 04_features.py, then re-run this script for the bank summary")
        return None
    df = pd.read_csv(path)
    df = df[df.split == "train"]
    s = df.groupby("year").agg(
        bank_eroded_ha=("target_eroded_ha", "sum"),
        bank_eroded_settlement_ha=("target_eroded_settlement_ha", "sum"),
        median_retreat_m=("target_retreat_m", "median"),
    )
    s.index.name = "monsoon"
    total = pd.read_csv(C.PROCESSED / "erosion_summary.csv").set_index("monsoon")
    s["box_eroded_ha"] = total["eroded_ha"]
    s["bank_share"] = (s.bank_eroded_ha / s.box_eroded_ha).round(3)
    return s.round(1)


def main():
    CHECKS.mkdir(parents=True, exist_ok=True)
    print(f"Region {C.REGION}")
    for y in (2018, 2020, 2024):
        quicklook(y)
    bankline_plot()
    print(f"Quick-look maps written to {CHECKS}")

    patches = sample_patches()
    patches.to_crs(4326).to_file(CHECKS / f"check_{C.REGION}.kml", driver="KML")
    res = optical_check(patches)
    res.to_csv(CHECKS / "optical_check.csv", index=False)
    print(res[["monsoon", "kind", "area_ha", "veg_before", "veg_after", "confirmed"]].round(2).to_string())
    print(f"\nOptical check: {int(res.confirmed.sum())} of {len(res)} patches confirmed "
          "(vegetated before, not vegetated after). Doc rule: 15 or more is good.")

    s = bank_summary()
    if s is not None:
        s.to_csv(CHECKS / "bank_erosion_summary.csv")
        print("\nErosion near the main banks (2 km landward + 60 m riverward) vs whole box:")
        print(s.to_string())


if __name__ == "__main__":
    main()
