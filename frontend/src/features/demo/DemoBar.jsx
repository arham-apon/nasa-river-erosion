import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import { useDemo } from "./DemoContext.jsx";
import { fmtNum } from "../../lib/format.js";
import s from "../../components/layout/layout.module.css";

export default function DemoBar() {
  const { t, i18n } = useTranslation();
  const demo = useDemo();
  if (!demo?.current) return null;
  const k = demo.current.key;
  const last = demo.step === demo.total;
  return (
    <aside className={s.demo} aria-live="polite" aria-label={t("demo.label")}>
      <div>
        <div className={s.demoStep}>
          {t("demo.step", { n: fmtNum(demo.step, i18n.language), total: fmtNum(demo.total, i18n.language) })}
        </div>
        <div className={s.demoTitle}>{t(`demo.${k}.title`)}</div>
        <div className={s.demoText}>{t(`demo.${k}.text`)}</div>
      </div>
      <div className={s.demoActions}>
        {demo.step > 1 && (
          <Button variant="quiet" onClick={demo.back}>
            {t("demo.back")}
          </Button>
        )}
        <Button variant="primary" onClick={demo.next}>
          {last ? t("demo.finish") : t("demo.next")}
        </Button>
        <Button variant="quiet" onClick={demo.exit} aria-label={t("demo.exit")}>
          <X size={16} />
        </Button>
      </div>
    </aside>
  );
}
