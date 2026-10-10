// Snapshot short Wikipedia summaries (English + Bangla) and lead photos for the rivers labelled on the overview map.
// Run when the list changes:  node scripts/fetch-river-info.mjs
// Text is CC BY-SA from Wikipedia; photos are hot-linked from Wikimedia Commons and credited in the UI.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "content", "rivers.json");
const HEADERS = { "User-Agent": "RiverWatch-hackathon/0.1 (river erosion research prototype)" };

// key = the label name used by the overview map → [English article, Bangla article]
const RIVERS = {
  Brahmaputra: ["Brahmaputra River", "ব্রহ্মপুত্র নদ"],
  Jamuna: ["Jamuna River (Bangladesh)", "যমুনা নদী (বাংলাদেশ)"],
  Teesta: ["Teesta River", "তিস্তা নদী"],
  Padma: ["Padma River", "পদ্মা নদী"],
  Meghna: ["Meghna River", "মেঘনা নদী"],
  Surma: ["Surma River", "সুরমা নদী"],
  Kushiyara: ["Kushiyara River", "কুশিয়ারা নদী"],
  "Old Brahmaputra": ["Old Brahmaputra River", "পুরাতন ব্রহ্মপুত্র নদ"],
  Karnaphuli: ["Karnaphuli River", "কর্ণফুলী নদী"],
  Matamuhuri: ["Matamuhuri River", "মাতামুহুরী নদী"],
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function summary(lang, title) {
  const r = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`,
    { headers: HEADERS },
  );
  if (!r.ok) throw new Error(`${lang}:${title} → HTTP ${r.status}`);
  return r.json();
}

// Some Bangla summaries leak image markup such as "…|266x266পিক্সেল]]"; drop it.
const clean = (s) => (s ?? "").replace(/[^\s।.]*\|[^\]]*\]\]/g, "").replace(/\s{2,}/g, " ").trim();

// First two sentences keep the popup short; the page shows the full summary.
const lead = (text, n = 2) => (text.match(/[^.!?।]+[.!?।]+/g) ?? [text]).slice(0, n).join("").trim();

const out = {};
const pause = () => new Promise((r) => setTimeout(r, 4000)); // stay well under Wikipedia's rate limit

for (const [name, [title, bt]] of Object.entries(RIVERS)) {
  await pause();
  const en = await summary("en", title);
  const bn = await summary("bn", bt).catch(() => null);
  const img = en.thumbnail?.source ?? null;
  const file = en.originalimage?.source?.split("/").pop() ?? null;
  out[name] = {
    id: slug(name),
    name,
    // Wikimedia serves only standard thumbnail widths; 500 is one of them.
    image: img ? img.split("?")[0].replace(/\/\d+px-/, "/500px-") : null,
    imageCredit: file ? `https://commons.wikimedia.org/wiki/File:${file.split("?")[0].replace(/^\d+px-/, "")}` : null,
    en: { title: en.title, short: lead(clean(en.extract)), extract: clean(en.extract), url: en.content_urls?.desktop?.page },
    bn: bn ? { title: bn.title, short: lead(clean(bn.extract)), extract: clean(bn.extract), url: bn.content_urls?.desktop?.page } : null,
  };
  console.log(`${name}: ${en.title}${bn ? ` / ${bn.title}` : ""}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}`);
