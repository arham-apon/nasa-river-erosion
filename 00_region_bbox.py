"""Print a study box [west, south, east, north] around named upazilas (geoBoundaries ADM3).

Usage: python 00_region_bbox.py chauhali chowhali kazipur
The east side gets extra padding so the whole Jamuna channel and the opposite bank are inside.
"""
import sys

import geopandas as gpd

import config as C

PAD = 0.03
PAD_EAST = 0.12


def main():
    names = sys.argv[1:] or ["chauhali", "chowhali", "kazipur"]
    g = gpd.read_file(C.BOUNDARIES / "geoBoundaries-BGD-ADM3.shp")
    sel = g[g["shapeName"].str.contains("|".join(names), case=False, na=False)]
    if sel.empty:
        raise SystemExit(f"No upazila matched {names}. Names look like: {sorted(g.shapeName)[:20]} ...")
    print("Matched:", sel["shapeName"].tolist())
    w, s, e, n = sel.total_bounds
    print("Upazila bounds:", [round(float(v), 3) for v in (w, s, e, n)])
    print("Box:", [round(float(v), 2) for v in (w - PAD, s - PAD, e + PAD_EAST, n + PAD)])


if __name__ == "__main__":
    main()
