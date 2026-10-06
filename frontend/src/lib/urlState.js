import { useCallback } from "react";
import { useSearchParams } from "react-router";

export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch, opts = {}) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      }, opts),
    [setParams],
  );
  return [params, update];
}

export const intParam = (params, key) => {
  const v = params.get(key);
  return v != null && /^\d+$/.test(v) ? Number(v) : null;
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
