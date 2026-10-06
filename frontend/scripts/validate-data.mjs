// Deploy-time check of the committed data bundle (no Python needed). Fails the build on a broken snapshot.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const errors = [];
const fail = (msg) => errors.push(msg);

function load(rel) {
  const p = join(DATA, rel);
  if (!existsSync(p)) {
    fail(`missing ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${rel}: invalid JSON (${e.message})`);
    return null;
  }
}

const manifest = load("manifest.json");
if (!manifest) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (manifest.schemaVersion !== 1) fail(`unsupported schemaVersion ${manifest.schemaVersion}`);

const unions = load(manifest.layers.unions);
const unionKeys = new Set();
for (const f of unions?.features ?? []) {
  const k = `${f.properties.region}:${f.properties.key}`;
  if (unionKeys.has(k)) fail(`duplicate union ${k}`);
  unionKeys.add(k);
}
if (unions && unions.features.length !== manifest.counts.unions) fail("union count differs from manifest");

for (const [region, meta] of Object.entries(manifest.regions)) {
  const fc = load(meta.layers.forecast);
  const ids = new Set();
  for (const f of fc?.features ?? []) {
    const p = f.properties;
    if (ids.has(p.id)) fail(`${region}: duplicate section ${p.id}`);
    ids.add(p.id);
    if (!(p.prob >= 0 && p.prob <= 1)) fail(`${region}/${p.id}: prob ${p.prob} out of range`);
    if (!["High", "Medium", "Low"].includes(p.risk)) fail(`${region}/${p.id}: risk ${p.risk}`);
    if (p.union && !unionKeys.has(`${region}:${p.union}`)) fail(`${region}/${p.id}: unknown union ${p.union}`);
  }
  if (fc && fc.features.length !== meta.sections) fail(`${region}: section count differs from manifest`);

  const hist = load(meta.layers.history);
  for (const id of Object.keys(hist?.sections ?? {})) if (!ids.has(id)) fail(`${region}: history for unknown ${id}`);

  for (const y of meta.erosionYears) load(meta.layers.erosion.replace("{year}", y));
  for (const key of ["banklines", "banklines3d", "nisar", "nisarGeometry"]) load(meta.layers[key]);

  const [w, s, e, n] = meta.bounds;
  if (!(w > 88 && e < 93 && s > 20 && n < 27 && w < e && s < n)) fail(`${region}: bounds ${meta.bounds}`);
}

for (const a of load(manifest.layers.alerts) ?? []) {
  if (!unionKeys.has(`${a.region}:${a.union}`)) fail(`alert for unknown union ${a.region}:${a.union}`);
}
load(manifest.layers.evaluation);
load(manifest.layers.context);

if (errors.length) {
  console.error(`Data bundle invalid:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`Data bundle OK: snapshot ${manifest.snapshotId}, ${unionKeys.size} unions, ` +
  Object.entries(manifest.regions).map(([r, m]) => `${r} ${m.sections} sections`).join(", "));
