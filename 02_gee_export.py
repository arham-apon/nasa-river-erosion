import argparse
import time

import ee

import config as C
import gee_common as G

DONE = {"COMPLETED", "SUCCEEDED", "FAILED", "CANCELLED"}


def class_task(year):
    return ee.batch.Export.image.toDrive(
        image=G.class_image(year),
        description=f"class_{year}",
        folder=C.DRIVE_FOLDER,
        fileNamePrefix=f"class_{year}",
        region=G.aoi(),
        crs=C.CRS,
        scale=C.SCALE_EXPORT,
        maxPixels=1e10,
        fileFormat="GeoTIFF",
    )


def buildings_task():
    def to_point(f):
        c = f.geometry().centroid(maxError=1).coordinates()
        return ee.Feature(
            None,
            {"lon": c.get(0), "lat": c.get(1), "area_m2": f.get("area_in_meters"), "confidence": f.get("confidence")},
        )

    fc = (
        ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons")
        .filterBounds(G.aoi())
        .filter(ee.Filter.gte("confidence", C.BUILDING_CONFIDENCE))
        .map(to_point)
    )
    return ee.batch.Export.table.toDrive(
        collection=fc,
        description="buildings",
        folder=C.DRIVE_FOLDER,
        fileNamePrefix="buildings",
        fileFormat="CSV",
        selectors=["lon", "lat", "area_m2", "confidence"],
    )


def worldpop_task():
    img = (
        ee.ImageCollection("WorldPop/GP/100m/pop")
        .filter(ee.Filter.eq("country", "BGD"))
        .filter(ee.Filter.eq("year", C.WORLDPOP_YEAR))
        .first()
        .select("population")
        .toFloat()
    )
    return ee.batch.Export.image.toDrive(
        image=img,
        description=f"worldpop_{C.WORLDPOP_YEAR}",
        folder=C.DRIVE_FOLDER,
        fileNamePrefix=f"worldpop_{C.WORLDPOP_YEAR}",
        region=G.aoi(),
        crs=C.CRS,
        scale=100,
        maxPixels=1e10,
        fileFormat="GeoTIFF",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="*", type=int)
    ap.add_argument("--skip-context", action="store_true")
    ap.add_argument("--wait", action="store_true")
    args = ap.parse_args()

    G.init()
    years = args.years or list(range(C.FIRST_DRY_SEASON, C.LAST_DRY_SEASON + 1))

    for year in years:
        counts = G.image_counts(year)
        print(f"Dry season {year - 1}/{year}: ascending={counts['ascending']} descending={counts['descending']}")
        if counts["ascending"] == 0 or counts["descending"] == 0:
            raise SystemExit(
                f"No images for {year - 1}/{year}. Check ASC_ORBIT/DESC_ORBIT in config.py or set them to None."
            )

    tasks = [(f"class_{y}", class_task(y)) for y in years]
    if not args.skip_context:
        tasks += [("buildings", buildings_task()), (f"worldpop_{C.WORLDPOP_YEAR}", worldpop_task())]

    for name, t in tasks:
        t.start()
        print(f"Started {name}")
    print(f"\nTrack tasks at https://code.earthengine.google.com/tasks (Drive folder: {C.DRIVE_FOLDER})")

    if not args.wait:
        return
    while True:
        states = {name: t.status()["state"] for name, t in tasks}
        print(time.strftime("%H:%M:%S"), " ".join(f"{k}:{v}" for k, v in states.items()))
        if all(s in DONE for s in states.values()):
            break
        time.sleep(60)
    for name, t in tasks:
        st = t.status()
        if st["state"] in {"FAILED", "CANCELLED"}:
            print(f"{name} {st['state']}: {st.get('error_message', '')}")


if __name__ == "__main__":
    main()
