"""Step 9: train and test the erosion model on both regions; save results, models and predictions to data/model/."""
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import config as C

REGIONS = list(C.REGIONS)
OUT = C.ROOT / "data" / "model"
TRAIN_LAST = 2022
TEST_YEARS = [2023, 2024, 2025]
TOP_FRAC = 0.20
CANDIDATES = [
    "eroded_ha_lag1", "eroded_ha_lag2", "eroded_ha_lag3",
    "retreat_m_lag1", "retreat_m_lag2", "eroded_settlement_ha_lag1",
    "bulge_m", "corridor_width_m", "side_is_west",
    "eroded_3yr_mean", "erosion_count_3yr", "retreat_accel",
    "jrc_occ_river", "jrc_occ_land", "hand_land_m",
    "dw_water_river", "dw_water_change",
]


def load():
    frames = []
    for r in REGIONS:
        p = C.ROOT / "data" / r / "processed" / "training_table.csv"
        if not p.exists():
            print(f"missing {p}, skipped")
            continue
        d = pd.read_csv(p)
        d["region"] = r
        frames.append(d)
    df = pd.concat(frames, ignore_index=True)
    lags = df[["eroded_ha_lag1", "eroded_ha_lag2", "eroded_ha_lag3"]]
    df["eroded_3yr_mean"] = lags.mean(axis=1)
    df["erosion_count_3yr"] = (lags >= 1).sum(axis=1)
    df["retreat_accel"] = df["retreat_m_lag1"] - df["retreat_m_lag2"]
    return df


def gbm():
    return HistGradientBoostingClassifier(
        max_depth=4, max_iter=200, learning_rate=0.05, min_samples_leaf=20,
        l2_regularization=1.0, class_weight="balanced", random_state=42,
    )


def logreg():
    return make_pipeline(
        SimpleImputer(strategy="median"), StandardScaler(),
        LogisticRegression(class_weight="balanced", max_iter=2000),
    )


def top_flags(score, groups):
    """Flag the highest-scoring TOP_FRAC of rows within each region-year."""
    flags = np.zeros(len(score), dtype=bool)
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        k = max(1, int(round(TOP_FRAC * len(idx))))
        flags[idx[np.argsort(-score[idx])[:k]]] = True
    return flags


def evaluate(name, y, score, groups):
    flags = top_flags(score, groups)
    pos = int((y == 1).sum())
    tp = int((flags & (y == 1)).sum())
    return {
        "model": name,
        "pr_auc": round(average_precision_score(y, score), 3) if pos else np.nan,
        "recall_top20": round(tp / max(1, pos), 3),
        "precision_top20": round(tp / max(1, int(flags.sum())), 3),
        "positives": pos,
        "rows": len(y),
    }


def run_all(name_prefix, tr, te, feats):
    y = te["target"].to_numpy()
    groups = (te["region"] + "_" + te["year"].astype(str)).to_numpy()
    rows = [
        evaluate(f"{name_prefix}random", y, np.random.default_rng(0).random(len(te)), groups),
        evaluate(f"{name_prefix}persistence", y, te["eroded_ha_lag1"].fillna(0).to_numpy(), groups),
        evaluate(f"{name_prefix}3-year mean", y, te["eroded_3yr_mean"].fillna(0).to_numpy(), groups),
    ]
    lr = logreg().fit(tr[feats], tr["target"])
    rows.append(evaluate(f"{name_prefix}logistic regression", y, lr.predict_proba(te[feats])[:, 1], groups))
    m = gbm().fit(tr[feats], tr["target"])
    prob = m.predict_proba(te[feats])[:, 1]
    rows.append(evaluate(f"{name_prefix}gradient boosting", y, prob, groups))
    return rows, m, prob, groups


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    feats = [c for c in CANDIDATES if c in df.columns]
    print("features used:", feats)

    lab = df[(df["split"] == "train") & df["target"].notna()].copy()
    lab["target"] = lab["target"].astype(int)
    print("\nshare of stretches with major erosion:")
    print(lab.groupby("region")["target"].mean().round(3).to_string())

    tr = lab[lab["year"] <= TRAIN_LAST]
    te = lab[lab["year"].isin(TEST_YEARS)].copy()

    rows, model, prob, groups = run_all("", tr, te, feats)
    res = pd.DataFrame(rows)
    print("\nTIME SPLIT (train <= %d, test %s)" % (TRAIN_LAST, TEST_YEARS))
    print(res.to_string(index=False))
    res.to_csv(OUT / "results_time_split.csv", index=False)
    joblib.dump({"model": model, "features": feats, "train_last": TRAIN_LAST}, OUT / "model_hindcast.joblib")

    regions = sorted(lab["region"].unique())
    if len(regions) == 2:
        cross = []
        for a, b in [(regions[0], regions[1]), (regions[1], regions[0])]:
            r, _, _, _ = run_all(f"{a}->{b}: ", tr[tr["region"] == a], te[te["region"] == b], feats)
            cross += r
        cross = pd.DataFrame(cross)
        print("\nCROSS-REGION")
        print(cross.to_string(index=False))
        cross.to_csv(OUT / "results_cross_region.csv", index=False)

    imp = permutation_importance(model, te[feats], te["target"], scoring="average_precision",
                                 n_repeats=10, random_state=42)
    imp = pd.Series(imp.importances_mean, index=feats).sort_values(ascending=False).round(4)
    print("\nFEATURE IMPORTANCE (drop in PR-AUC when shuffled)")
    print(imp.to_string())
    imp.to_csv(OUT / "feature_importance.csv", header=["importance"])

    te["prob"] = prob
    te["flag_top20"] = top_flags(prob, groups)
    te["outcome"] = np.select(
        [te["flag_top20"] & (te["target"] == 1),
         ~te["flag_top20"] & (te["target"] == 1),
         te["flag_top20"] & (te["target"] == 0)],
        ["hit", "missed", "false_alarm"],
        "correct_quiet",
    )
    te.to_csv(OUT / "hindcast_predictions.csv", index=False)

    final = gbm().fit(lab[feats], lab["target"])
    joblib.dump({"model": final, "features": feats, "train_years": sorted(lab["year"].unique().tolist())},
                OUT / "model_final.joblib")
    fc = df[df["split"] == "forecast"].copy()
    fc["prob"] = final.predict_proba(fc[feats])[:, 1]
    pr = fc.groupby("region")["prob"].rank(pct=True)
    fc["risk_class"] = np.where(pr > 0.9, "High", np.where(pr > 0.7, "Medium", "Low"))
    fc.to_csv(OUT / "forecast_predictions.csv", index=False)
    (OUT / "run_info.json").write_text(json.dumps(
        {"features": feats, "train_last": TRAIN_LAST, "test_years": TEST_YEARS, "top_frac": TOP_FRAC,
         "labelled_rows": int(len(lab)), "forecast_rows": int(len(fc))}, indent=2))
    print(f"\nsaved results and models to {OUT}")


if __name__ == "__main__":
    main()
