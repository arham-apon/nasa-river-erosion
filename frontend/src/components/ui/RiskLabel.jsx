import { useTranslation } from "react-i18next";
import s from "./ui.module.css";

export function RiskShape({ level, size = 10 }) {
  if (level === "High")
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 0.8 9.4 9H0.6Z" fill="currentColor" />
      </svg>
    );
  if (level === "Medium")
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" fill="currentColor" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** kind: "risk" (section forecast class) or "priority" (union priority level) */
export default function RiskLabel({ level, kind = "risk" }) {
  const { t } = useTranslation();
  return (
    <span className={`${s.risk} ${s[`risk${level}`]}`}>
      <RiskShape level={level} />
      {t(`${kind}.${level}`)}
    </span>
  );
}
