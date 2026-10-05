import ee

import config as C


def init():
    ee.Initialize(project=C.GEE_PROJECT)


def aoi():
    return ee.Geometry.Rectangle(C.AOI_BBOX, proj="EPSG:4326", geodesic=False)


def dry_season(end_year):
    return ee.Date.fromYMD(end_year - 1, 11, 1), ee.Date.fromYMD(end_year, 5, 1)


def s1_db(start, end, orbit_pass, orbit_number):
    col = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi())
        .filterDate(start, end)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.eq("resolution_meters", 10))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.eq("orbitProperties_pass", orbit_pass))
    )
    if orbit_number is not None:
        col = col.filter(ee.Filter.eq("relativeOrbitNumber_start", orbit_number))

    def prep(img):
        angle = img.select("angle")
        ok = angle.gte(C.INCIDENCE_MIN).And(angle.lte(C.INCIDENCE_MAX))
        return ee.Image(img.select("VV").updateMask(ok).copyProperties(img, ["system:time_start"]))

    return col.map(prep)


def image_counts(end_year):
    start, end = dry_season(end_year)
    asc = s1_db(start, end, "ASCENDING", C.ASC_ORBIT).size()
    desc = s1_db(start, end, "DESCENDING", C.DESC_ORBIT).size()
    return ee.Dictionary({"ascending": asc, "descending": desc}).getInfo()


def land_db(end_year):
    start, end = dry_season(end_year)
    col = s1_db(start, end, "ASCENDING", C.ASC_ORBIT)
    composite = col.mean().reproject(crs=C.CRS, scale=C.SCALE_NATIVE)
    smooth = composite.focalMean(radius=C.BOXCAR_RADIUS_PX, kernelType="square", units="pixels")
    return smooth.rename("db")


def settlement(end_year):
    start, end = dry_season(end_year)
    masks = []
    for orbit_pass, orbit in (("ASCENDING", C.ASC_ORBIT), ("DESCENDING", C.DESC_ORBIT)):
        col = s1_db(start, end, orbit_pass, orbit)
        power = col.map(lambda i: ee.Image(10).pow(i.divide(10)))
        amp = power.map(lambda i: i.sqrt())
        dispersion = amp.reduce(ee.Reducer.stdDev()).divide(amp.mean())
        mean_db = power.mean().log10().multiply(10)
        ps = dispersion.lt(C.PS_DISPERSION_MAX).And(mean_db.gt(C.PS_MEAN_DB_MIN))
        masks.append(ps.unmask(0))
    return masks[0].Or(masks[1]).reproject(crs=C.CRS, scale=C.SCALE_NATIVE).rename("settle")


def class_image(end_year):
    land = land_db(end_year).gte(C.LAND_THRESHOLD_DB)
    land_out = land.reduceResolution(reducer=ee.Reducer.mode(), maxPixels=64).reproject(
        crs=C.CRS, scale=C.SCALE_EXPORT
    )
    settle_out = settlement(end_year).reduceResolution(reducer=ee.Reducer.max(), maxPixels=64).reproject(
        crs=C.CRS, scale=C.SCALE_EXPORT
    )
    return land_out.where(settle_out.eq(1), 2).unmask(255).toUint8().rename("cls")
