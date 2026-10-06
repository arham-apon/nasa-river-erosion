import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./client.js";

const useFile = (path, opts = {}) =>
  useQuery({ queryKey: ["data", path], queryFn: () => fetchJSON(path), enabled: Boolean(path), ...opts });

export const useManifest = () => useFile("manifest.json");

function useTopLayer(name) {
  const { data: m } = useManifest();
  return useFile(m?.layers?.[name]);
}

export const useUnions = () => useTopLayer("unions");
export const useEvaluation = () => useTopLayer("evaluation");
export const useAlerts = () => useTopLayer("alerts");
export const useCountry = () => useTopLayer("context");

export function useRegionLayer(region, layer, year) {
  const { data: m } = useManifest();
  let path = m?.regions?.[region]?.layers?.[layer];
  if (path && path.includes("{year}")) path = year == null ? undefined : path.replace("{year}", year);
  // Year-stepped layers keep showing the previous year until the next one arrives, so playback never blinks empty.
  return useFile(path, year != null ? { placeholderData: keepPreviousData } : {});
}
