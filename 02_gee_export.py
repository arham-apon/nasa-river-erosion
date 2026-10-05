import argparse
import time

import ee

import config as C
import gee_common as G

DONE = {"COMPLETED", "SUCCEEDED", "FAILED", "CANCELLED"}


def buildings_fc():
    def to_point(f):
        c = f.geometry().centroid(maxError=1).coordinates()
        return ee.Feature(
            None,
            {"lon": c.get(0), "lat": c.get(1), "area_m2": f.get("area_in_meters"), "confidence": f.get("confidence")},
        )

    return (
        ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons")
        .filterBounds(G.aoi())
        .filter(ee.Filter.gte("confidence", C.BUILDING_CONFIDENCE))
        .map(to_point)
    )


def buildings_task():
    task = ee.batch.Export.table.toDrive(
        collection=buildings_fc(),
        description=f"{C.REGION}_buildings",
        folder=C.DRIVE_FOLDER,
        fileNamePrefix="buildings",
        fileFormat="CSV",
        selectors=["lon", "lat", "area_m2", "confidence"],
    )
    task.start()
    return task


def worldpop_image():
    return (
        ee.ImageCollection("WorldPop/GP/100m/pop")
        .filter(ee.Filter.eq("country", "BGD"))
        .filter(ee.Filter.eq("year", C.WORLDPOP_YEAR))
        .first()
        .select("population")
        .toFloat()
    )


def wait(tasks):
    while True:
        states = {name: t.status()["state"] for name, t in tasks}
        print(time.strftime("%H:%M:%S"), " ".join(f"{k}:{v}" for k, v in states.items()), flush=True)
        if all(s in DONE for s in states.values()):
            break
        time.sleep(60)
    for name, t in tasks:
        st = t.status()
        if st["state"] in {"FAILED", "CANCELLED"}:
            print(f"{name} {st['state']}: {st.get('error_message', '')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="*", type=int)
    ap.add_argument("--skip-context", action="store_true")
    ap.add_argument("--wait", action="store_true")
    args = ap.parse_args()

    G.init()
    years = args.years or list(range(C.FIRST_DRY_SEASON, C.LAST_DRY_SEASON + 1))
    print(f"Region {C.REGION}, box {C.AOI_BBOX}, threshold {C.LAND_THRESHOLD_DB} dB")

    for year in years:
        counts = G.image_counts(year)
        print(f"Dry season {year - 1}/{year}: ascending={counts['ascending']} descending={counts['descending']}")
        if counts["ascending"] == 0 or counts["descending"] == 0:
            raise SystemExit(
                f"No images for {year - 1}/{year}. Check ASC_ORBIT/DESC_ORBIT in config.py or set them to None."
            )

    tasks = [(f"class_{y}", G.export_image(G.class_image(y), f"class_{y}", C.SCALE_EXPORT)) for y in years]
    if not args.skip_context:
        tasks.append(("buildings", buildings_task()))
        name = f"worldpop_{C.WORLDPOP_YEAR}"
        tasks.append((name, G.export_image(worldpop_image(), name, 100)))
    for name, _ in tasks:
        print(f"Started {name}")
    print(f"\nTrack tasks at https://code.earthengine.google.com/tasks (Drive folder: {C.DRIVE_FOLDER})")

    if args.wait:
        wait(tasks)


if __name__ == "__main__":
    main()
