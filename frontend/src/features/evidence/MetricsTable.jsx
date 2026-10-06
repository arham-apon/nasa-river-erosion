import { useTranslation } from "react-i18next";
import { fmtNum } from "../../lib/format.js";
import s from "../../pages/docs.module.css";

const MODEL_KEYS = {
  random: "random",
  persistence: "persistence",
  "3-year mean": "mean3",
  "logistic regression": "logreg",
  "gradient boosting": "gbm",
  "gradient boosting forecast": "gbmForecast",
  "persistence (2025 erosion)": "persistence2025",
  "random (expected)": "randomExpected",
};

export const modelLabel = (t, name) => t(`models.${MODEL_KEYS[name] ?? name}`, name);

const emphasis = (name) =>
  name.startsWith("gradient boosting") ? "model" : name.startsWith("persistence") ? "baseline" : undefined;

function Metric({ value, max, lang }) {
  return (
    <div className={s.metric}>
      <span>{fmtNum(value, lang, 3)}</span>
      <i>
        <b style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
      </i>
    </div>
  );
}

export default function MetricsTable({ rows, caption, showCounts = true }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const maxAuc = Math.max(...rows.map((r) => r.pr_auc ?? 0), 0.001);
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th>{t("evidence.ranking")}</th>
            <th>{t("evidence.prauc")}</th>
            <th>{t("evidence.recall")}</th>
            <th>{t("evidence.precision")}</th>
            {showCounts && <th>{t("evidence.events")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model} data-emph={emphasis(r.model)}>
              <td>{modelLabel(t, r.model)}</td>
              <td>
                <Metric value={r.pr_auc} max={maxAuc} lang={lang} />
              </td>
              <td>
                <Metric value={r.recall_top20} max={1} lang={lang} />
              </td>
              <td>
                <Metric value={r.precision_top20} max={1} lang={lang} />
              </td>
              {showCounts && (
                <td className="mono">
                  {fmtNum(r.positives ?? r.major_nisar, lang)} / {fmtNum(r.rows ?? r.stretches, lang)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
