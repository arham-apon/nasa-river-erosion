import { ChevronRight } from "lucide-react";
import s from "./ui.module.css";

export default function Disclosure({ title, children, defaultOpen = false }) {
  return (
    <details className={s.disclosure} open={defaultOpen}>
      <summary>
        {title}
        <ChevronRight size={16} aria-hidden="true" />
      </summary>
      <div className={s.disclosureBody}>{children}</div>
    </details>
  );
}
