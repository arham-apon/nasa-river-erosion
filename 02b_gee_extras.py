"""Export extra free layers per region: JRC water history + MERIT HAND (static) and Dynamic World dry-season water."""
import argparse
import importlib

import ee

import config as C
import gee_common as G

DW = "GOOGLE/DYNAMICWORLD/V1"
wait = importlib.import_module("02_gee_export").wait


def static_layers():
    jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").unmask(0).rename("jrc_occ")
    hand = ee.Image("MERIT/Hydro/v1_0_1").select("hnd").rename("hand_m")
    return jrc.addBands(hand).toFloat()


def dw_collection(year):
    start, end = G.dry_season(year)
    return ee.ImageCollection(DW).filterBounds(G.aoi()).filterDate(start, end).select("water")


def dw_water(year):
    return dw_collection(year).mean().multiply(100).round().unmask(255).toUint8().rename("dw_water")


def main():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--years", nargs="+", type=int, default=list(range(max(2016, C.FIRST_DRY_SEASON), C.LAST_DRY_SEASON + 1))
    )
    p.add_argument("--skip-static", action="store_true")
    p.add_argument("--wait", action="store_true")
    a = p.parse_args()

    G.init()
    tasks = []
    if not a.skip_static:
        tasks.append(("static_layers", G.export_image(static_layers(), "static_layers", C.SCALE_EXPORT)))
    for y in a.years:
        if dw_collection(y).size().getInfo() == 0:
            print(f"{y}: no Dynamic World images, skipped")
            continue
        tasks.append((f"dw_water_{y}", G.export_image(dw_water(y), f"dw_water_{y}", C.SCALE_EXPORT)))

    print(f"{C.REGION}: started {len(tasks)} tasks. Watch: https://code.earthengine.google.com/tasks")
    if a.wait:
        wait(tasks)


if __name__ == "__main__":
    main()
