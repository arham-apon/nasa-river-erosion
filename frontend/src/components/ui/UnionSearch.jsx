import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import RiskLabel from "./RiskLabel.jsx";
import { fmtNum } from "../../lib/format.js";
import s from "./ui.module.css";

export default function UnionSearch({ unions, onSelect, placeholder, autoFocus = false }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? unions.filter((u) => u.name.toLowerCase().includes(q)) : unions;
  }, [unions, query]);

  const choose = (u) => {
    setQuery("");
    setOpen(false);
    onSelect(u);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={s.combo}>
      <Search size={16} className={s.comboIcon} aria-hidden="true" />
      <input
        className={s.comboInput}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 120))}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className={s.comboList} id={listId} role="listbox" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {results.length === 0 && <li className={s.comboEmpty}>{t("search.none")}</li>}
          {results.map((u, i) => (
            <li
              key={u.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={s.comboOption}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(u)}
            >
              <span className={s.comboRank}>{fmtNum(u.rankRegion, i18n.language)}</span>
              <span>{u.name}</span>
              <RiskLabel level={u.level} kind="priority" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
