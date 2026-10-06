import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import Segmented from "../ui/Segmented.jsx";
import { useManifest } from "../../data/queries.js";
import { fmtDate } from "../../lib/format.js";
import s from "./layout.module.css";

const LINKS = [
  { to: "/", key: "nav.home", end: true },
  { to: "/my-area", key: "nav.myArea" },
  { to: "/river-changes", key: "nav.riverChanges" },
  { to: "/how-it-works", key: "nav.howItWorks" },
  { to: "/about", key: "nav.about" },
];

export function BrandMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 3c4 5-3 9 1 14s9 4 8 12" fill="none" stroke="var(--water)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 5c-2 3 1 6 3 8" fill="none" stroke="var(--erosion)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const { data: manifest } = useManifest();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const links = LINKS.map((l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `${s.navLink} ${isActive ? s.active : ""}`}>
      {t(l.key)}
    </NavLink>
  ));

  return (
    <header className={s.header}>
      <NavLink to="/" className={s.brand} aria-label={t("app.name")}>
        <BrandMark />
        <span className={s.brandName}>{t("app.name")}</span>
        <span className={s.brandScope}>{t("app.scope")}</span>
      </NavLink>

      <nav className={s.nav} aria-label={t("nav.label")}>
        {links}
      </nav>

      <div className={s.headerRight}>
        {manifest && (
          <span className={s.snapshot} title={t("app.snapshotHint")}>
            {t("app.dataTo", { date: fmtDate(manifest.snapshotId, i18n.language) })}
          </span>
        )}
        <Segmented
          label={t("app.language")}
          value={i18n.language}
          onChange={(l) => i18n.changeLanguage(l)}
          options={[
            { value: "bn", label: "বাংলা" },
            { value: "en", label: "EN" },
          ]}
        />
        <button
          type="button"
          className={s.menuButton}
          aria-expanded={menuOpen}
          aria-label={t("nav.menu")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuOpen && (
        <nav className={s.mobileNav} aria-label={t("nav.label")}>
          {links}
        </nav>
      )}
    </header>
  );
}
