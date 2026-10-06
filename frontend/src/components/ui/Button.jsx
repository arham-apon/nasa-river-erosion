import { Link } from "react-router";
import s from "./ui.module.css";

export default function Button({ variant, to, className = "", ...rest }) {
  const cls = `${s.button} ${variant ? s[variant] : ""} ${className}`;
  if (to) return <Link to={to} className={cls} {...rest} />;
  return <button type="button" className={cls} {...rest} />;
}
