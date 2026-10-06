import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import s from "./ui.module.css";

export function Loading({ label }) {
  const { t } = useTranslation();
  return (
    <div className={s.skeleton} role="status" aria-label={label ?? t("state.loading")}>
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className={s.state} role="alert">
      <h3>{t("state.errorTitle")}</h3>
      <p>{t("state.errorBody")}</p>
      {error?.message && <p className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{error.message}</p>}
      {onRetry && (
        <button type="button" className={s.button} style={{ marginTop: 12 }} onClick={() => onRetry()}>
          <RotateCw size={14} /> {t("state.retry")}
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className={s.state}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

/** Renders loading / error for one or more queries, otherwise children. */
export function QueryGate({ queries, children, loading }) {
  const list = [].concat(queries);
  const failed = list.find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => list.forEach((q) => q.isError && q.refetch())} />;
  if (list.some((q) => q.isPending)) return loading ?? <Loading />;
  return children;
}
