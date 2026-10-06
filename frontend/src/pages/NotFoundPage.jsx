import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button.jsx";
import s from "../components/layout/layout.module.css";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className={s.notFound}>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Button to="/" variant="primary">
        {t("notFound.home")}
      </Button>
    </div>
  );
}
