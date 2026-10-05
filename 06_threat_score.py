"""Step 10: Erosion Threat Score per bank stretch and per union, GeoJSON for the dashboard, Bangla alert text."""
import json
import shutil

import geopandas as gpd
import numpy as np
import pandas as pd

import config as C

ID_COLS = ["segment", "side"]
MODEL = C.ROOT / "data" / "model"
UNIONS = C.BOUNDARIES / "geoBoundaries-BGD-ADM4.shp"
OUT = C.ROOT / "data" / "web"
W_RISK, W_RETREAT, W_POP, W_BLDG = 0.5, 0.2, 0.2, 0.1

ALERT_BN = (
    "সতর্কবার্তা: {union} ইউনিয়নের নদীপাড়ে আগামী বর্ষায় ভাঙনের ঝুঁকি বেশি। "
    "নদীর পাড়ের কাছে থাকা ঘরবাড়ি, গবাদিপশু ও মূল্যবান জিনিসপত্র নিরাপদ স্থানে সরানোর প্রস্তুতি নিন। "
    "বিস্তারিত জানতে ইউনিয়ন পরিষদে যোগাযোগ করুন।"
)


def segment_layer(table, keep, name):
    parts = []
    for r in table["region"].unique():
        p = C.ROOT / "data" / r / "processed" / "segments.gpkg"
        if not p.exists():
            print(f"missing {p}")
            continue
        seg = gpd.read_file(p)
        keys = [c for c in ID_COLS if c in seg.columns and c in table.columns]
        if not keys:
            print(f"fix ID_COLS. segments.gpkg columns: {list(seg.columns)}")
            continue
        sub = table.loc[table["region"] == r, keys + [c for c in keep if c not in keys]]
        parts.append(seg[keys + ["geometry"]].merge(sub, on=keys).to_crs(4326))
    if parts:
        gdf = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=4326)
        gdf.to_file(OUT / f"{name}.geojson", driver="GeoJSON")


def gpkg_to_geojson(region, gpkg, name, keep, query=None):
    p = C.ROOT / "data" / region / "processed" / gpkg
    if not p.exists():
        return None
    g = gpd.read_file(p)
    if query:
        g = g.query(query)
    g = g[keep + ["geometry"]].to_crs(4326)
    g["region"] = region
    return g


def extra_layers():
    """Banklines (every 2nd year) and recent erosion patches (monsoons 2021+, >= 3 ha) for the map."""
    banks = [gpkg_to_geojson(r, "banklines.gpkg", "banklines", ["dry_season", "side"], "dry_season % 2 == 0")
             for r in C.REGIONS]
    banks = [b for b in banks if b is not None]
    if banks:
        gdf = gpd.GeoDataFrame(pd.concat(banks, ignore_index=True), crs=4326)
        gdf["geometry"] = gdf.geometry.simplify(0.0002)
        gdf.to_file(OUT / "banklines.geojson", driver="GeoJSON")
    ero = [gpkg_to_geojson(r, "erosion_polygons.gpkg", "erosion", ["monsoon", "kind", "area_ha"], "area_ha >= 3 and monsoon >= 2021")
           for r in C.REGIONS]
    ero = [e for e in ero if e is not None]
    if ero:
        gdf = gpd.GeoDataFrame(pd.concat(ero, ignore_index=True), crs=4326)
        gdf["geometry"] = gdf.geometry.simplify(0.0002)
        gdf["area_ha"] = gdf.area_ha.round(1)
        gdf.to_file(OUT / "erosion.geojson", driver="GeoJSON")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    f = pd.read_csv(MODEL / "forecast_predictions.csv")
    f["retreat_recent_m"] = f[["retreat_m_lag1", "retreat_m_lag2"]].mean(axis=1).fillna(0).clip(lower=0)
    for c in ["population", "buildings"]:
        f[c] = f[c].fillna(0)
    g = f.groupby("region")
    f["segment_score"] = (
        W_RISK * g["prob"].rank(pct=True)
        + W_RETREAT * g["retreat_recent_m"].rank(pct=True)
        + W_POP * g["population"].rank(pct=True)
        + W_BLDG * g["buildings"].rank(pct=True)
    ).round(3)
    f.to_csv(OUT / "segment_scores.csv", index=False)

    u = (
        f.dropna(subset=["union_id"])
        .groupby(["region", "union_id", "union_name"])
        .agg(
            max_score=("segment_score", "max"),
            mean_score=("segment_score", "mean"),
            stretches=("segment_score", "size"),
            high_stretches=("risk_class", lambda s: int((s == "High").sum())),
            population=("population", "sum"),
            buildings=("buildings", "sum"),
        )
        .reset_index()
    )
    u["threat_score"] = (0.6 * u["max_score"] + 0.4 * u["mean_score"]).round(3)
    u["threat_level"] = np.where(u["threat_score"] >= 0.7, "High",
                                 np.where(u["threat_score"] >= 0.5, "Medium", "Low"))
    u = u.sort_values("threat_score", ascending=False)
    u["rank"] = range(1, len(u) + 1)
    u["population"] = u["population"].round()
    u.to_csv(OUT / "union_ranking.csv", index=False)
    print(u[["rank", "region", "union_name", "threat_score", "threat_level", "high_stretches", "population"]]
          .head(15).to_string(index=False))

    boxes = [C.REGIONS[r]["bbox"] for r in C.REGIONS]
    bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    b = gpd.read_file(UNIONS, bbox=bbox)[["shapeID", "geometry"]].rename(columns={"shapeID": "union_id"})
    un = b.merge(u, on="union_id").to_crs(4326)
    un["geometry"] = un.geometry.simplify(0.0002)
    un.to_file(OUT / "unions.geojson", driver="GeoJSON")

    segment_layer(f, ["region", "year", "prob", "risk_class", "segment_score", "union_name", "population", "buildings"],
                  "segments_forecast")
    h = pd.read_csv(MODEL / "hindcast_predictions.csv")
    segment_layer(h, ["region", "year", "prob", "target", "target_eroded_ha", "outcome"], "segments_hindcast")
    extra_layers()

    for name in ("results_time_split.csv", "results_cross_region.csv", "feature_importance.csv"):
        p = MODEL / name
        if p.exists():
            (OUT / name.replace(".csv", ".json")).write_text(pd.read_csv(p).to_json(orient="records"))

    high = u[u["threat_level"] == "High"]
    alerts = [ALERT_BN.format(union=r.union_name) for r in high.itertuples()]
    (OUT / "alerts_bn.txt").write_text("\n\n".join(alerts), encoding="utf-8")
    (OUT / "alerts_bn.json").write_text(
        json.dumps([{"union": r.union_name, "region": r.region, "text": t} for r, t in zip(high.itertuples(), alerts)],
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(alerts)} Bangla alerts written to {OUT / 'alerts_bn.txt'}")
    shutil.copy(C.ROOT / "web" / "dashboard.html", OUT / "dashboard.html")
    print(f"Dashboard: python -m http.server 8000 --directory {OUT}  then open http://localhost:8000/dashboard.html")


if __name__ == "__main__":
    main()
