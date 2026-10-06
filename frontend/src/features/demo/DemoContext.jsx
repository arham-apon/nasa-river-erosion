import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useUnions } from "../../data/queries.js";
import { unionsOfRegion } from "../../data/selectors.js";

const DemoCtx = createContext(null);
const REGION = "sirajganj";

export function DemoProvider({ children }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { data: unions } = useUnions();

  const steps = useMemo(() => {
    // The highest-priority union that also has High sections gives the most to look at.
    const list = unionsOfRegion(unions, REGION);
    const union = (list.find((u) => u.highSections > 0) ?? list[0])?.key ?? "";
    return [
      { key: "find", to: `/my-area?region=${REGION}&union=${union}` },
      { key: "watch", to: `/river-changes?region=${REGION}&tab=banks&bank=2021&compare=2015&play=1` },
      { key: "observe", to: `/river-changes?region=${REGION}&tab=nisar` },
    ];
  }, [unions]);

  const go = useCallback(
    (i) => {
      setStep(i);
      if (i > 0) navigate(steps[i - 1].to);
    },
    [navigate, steps],
  );

  const value = useMemo(
    () => ({
      step,
      total: steps.length,
      current: step > 0 ? steps[step - 1] : null,
      start: () => go(1),
      next: () => (step < steps.length ? go(step + 1) : setStep(0)),
      back: () => step > 1 && go(step - 1),
      exit: () => setStep(0),
    }),
    [step, steps, go],
  );

  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export const useDemo = () => useContext(DemoCtx);
