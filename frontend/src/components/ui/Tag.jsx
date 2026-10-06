import s from "./ui.module.css";

/** tone: "forecast" | "observed" | "provisional" */
export default function Tag({ tone, children }) {
  return <span className={`${s.tag} ${s[tone] ?? ""}`}>{children}</span>;
}
