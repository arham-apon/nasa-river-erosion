import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext.jsx";
import s from "./themeToggle.module.css";

/** Day/night switch: the track shows the current sky (sun and clouds, or moon and stars). */
export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? t("app.themeLight") : t("app.themeDark");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t("app.themeSwitch")}
      title={label}
      className={s.toggle}
      data-mode={theme}
      onClick={toggle}
    >
      <svg className={s.clouds} viewBox="0 0 40 20" aria-hidden="true">
        <path d="M9 14a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A3.5 3.5 0 0 1 22 9.5 2.5 2.5 0 0 1 21.5 14Z" />
        <path d="M27 18a3 3 0 0 1 0-6 4 4 0 0 1 7.6-.6A2.8 2.8 0 0 1 37 16.2 1.9 1.9 0 0 1 36.6 18Z" />
      </svg>
      <svg className={s.stars} viewBox="0 0 40 20" aria-hidden="true">
        <circle cx="4" cy="5" r="0.9" />
        <circle cx="11" cy="12" r="0.7" />
        <circle cx="17" cy="4" r="1" />
        <circle cx="21" cy="15" r="0.6" />
        <circle cx="26" cy="8" r="0.8" />
        <circle cx="8" cy="16" r="0.6" />
      </svg>
      <span className={s.knob}>
        <span className={s.crater} style={{ left: "26%", top: "30%", width: "22%", height: "22%" }} />
        <span className={s.crater} style={{ left: "55%", top: "55%", width: "28%", height: "28%" }} />
        <span className={s.crater} style={{ left: "60%", top: "20%", width: "14%", height: "14%" }} />
      </span>
    </button>
  );
}
