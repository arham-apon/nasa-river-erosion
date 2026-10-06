const locale = (lang) => (lang === "bn" ? "bn-BD" : "en-GB");

export function fmtNum(value, lang, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function fmtPct(value, lang, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale(lang), {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function fmtYear(year, lang) {
  return new Intl.NumberFormat(locale(lang), { useGrouping: false }).format(year);
}

export function fmtDate(iso, lang, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { ...opts, timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
}

export const dayNumber = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
