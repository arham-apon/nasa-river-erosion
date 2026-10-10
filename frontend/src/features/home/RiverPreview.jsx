import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import s from "./riverPreview.module.css";

const W = 300;
const H = 330;

/** Hover/focus preview for a river named on the overview map. Text and photo come from a Wikipedia snapshot. */
export default function RiverPreview({ tip, info, label, onEnter, onLeave }) {
  const { t, i18n } = useTranslation();
  const text = (i18n.language === "bn" && info.bn) || info.en;
  // Prefer the right of the label; flip left when it would leave the stage; keep it inside vertically.
  const left = tip.x + 12 + W < tip.w ? tip.x + 12 : Math.max(8, tip.left - W - 12);
  const top = Math.min(Math.max(8, tip.y - 40), tip.h - H - 8);

  return (
    <div className={s.card} style={{ left, top, width: W }} onPointerEnter={onEnter} onPointerLeave={onLeave} role="dialog" aria-label={label}>
      {info.image && <img className={s.photo} src={info.image} alt={t("rivers.photoAlt", { river: label })} loading="lazy" />}
      <div className={s.body}>
        <h3 className={s.title}>{label}</h3>
        <p className={s.text}>{text.short}</p>
        <p className={s.credit}>
          <a href={text.url} target="_blank" rel="noreferrer">
            {t("rivers.source")}
          </a>
          {info.imageCredit && (
            <>
              {" · "}
              <a href={info.imageCredit} target="_blank" rel="noreferrer">
                {t("rivers.photoCredit")}
              </a>
            </>
          )}
        </p>
        <Link className={s.open} to={`/river/${info.id}`}>
          {t("rivers.open")} <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
