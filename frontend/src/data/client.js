export class DataError extends Error {}

// HTTP 200 is not enough: a missing file on a static host can come back as the app's HTML page.
export async function fetchJSON(path) {
  let res;
  try {
    res = await fetch(path.startsWith("/") ? path : `/data/${path}`);
  } catch {
    throw new DataError(`network:${path}`);
  }
  if (!res.ok) throw new DataError(`http-${res.status}:${path}`);
  const text = await res.text();
  const first = text.trimStart()[0];
  if (first !== "{" && first !== "[") throw new DataError(`not-json:${path}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new DataError(`invalid-json:${path}`);
  }
}
