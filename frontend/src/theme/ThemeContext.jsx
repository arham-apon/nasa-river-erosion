import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PALETTES } from "./palette.js";

const KEY = "rw-theme";
const ThemeCtx = createContext(null);

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage blocked */
  }
  return "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f3ec" : "#0b0d0c");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* not remembered */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  const value = useMemo(() => ({ theme, palette: PALETTES[theme], toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
export const usePalette = () => useContext(ThemeCtx).palette;
