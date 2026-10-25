// Where a place really is — found by the server, never taken from the model:
//   1. a Google Maps link the editor pasted (short maps.app.goo.gl links are expanded first — only Google's
//      own link hosts are fetched), then the place's own pin in the long link;
//   2. otherwise OpenStreetMap's Nominatim search on the address (US only; one request per second, as its
//      usage policy asks; identified by our User-Agent);
//   3. for a famous sight, a photo from Wikipedia / Wikimedia Commons with its author and licence.
// Every step is best-effort: when nothing is found the place is saved without a map pin (Waze / Google Maps
// still navigate by the address). CLAUDE_FAKE=1 (emulator tests) answers from a fixed table, no network.
import * as logger from "firebase-functions/logger";
import { coordsFromMapsUrl, findMapsUrl, isShortMapsUrl, nameFromMapsUrl } from "../shared/geo.js";
import { isFake } from "./claude.js";

const UA = "usa-trip-2027/1.0 (family trip website; https://shahards.github.io/usa-trip-2027/)";
const TIMEOUT_MS = 8000;

export interface Located {
  lat: number;
  lng: number;
  region?: string; // US state code
  mapsUrl?: string;
  nameFromLink?: string;
  source: "link" | "osm";
}

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, "Accept-Language": "en", ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

const GOOGLE_HOST = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+|consent\.google\.[a-z.]+)$/i;

/** Follow a short Google Maps link to the long one (Google hosts only, at most 4 hops). */
export async function expandMapsUrl(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 4 && (isShortMapsUrl(cur) || /^https:\/\/consent\.google\./.test(cur)); i++) {
    const host = new URL(cur).hostname;
    if (!GOOGLE_HOST.test(host)) break;
    const res = await get(cur, { redirect: "manual" });
    const next = res.headers.get("location");
    if (!next) break;
    const abs = new URL(next, cur).toString();
    // A consent page carries the real address in ?continue=
    const cont = new URL(abs).searchParams.get("continue");
    cur = cont && /google\./.test(new URL(abs).hostname) ? cont : abs;
    if (!GOOGLE_HOST.test(new URL(cur).hostname)) break;
  }
  return cur;
}

let lastOsm = 0;
async function osmSearch(q: string): Promise<{ lat: number; lng: number; region?: string } | null> {
  const wait = lastOsm + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsm = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await get(url);
  if (!res.ok) return null;
  const list: any[] = await res.json();
  const hit = list?.[0];
  if (!hit) return null;
  const iso = String(hit.address?.["ISO3166-2-lvl4"] || "");
  return {
    lat: Math.round(Number(hit.lat) * 1e6) / 1e6,
    lng: Math.round(Number(hit.lon) * 1e6) / 1e6,
    region: /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : undefined,
  };
}

const FAKE: Array<[RegExp, Located]> = [
  [/hampton inn richmond|richmond/i, { lat: 37.5407, lng: -77.4360, region: "VA", source: "osm" }],
  [/top of the rock|rockefeller/i, { lat: 40.7593, lng: -73.9794, region: "NY", source: "osm" }],
];

/** Find a place's location from what the model gave (maps_url / address / name + city) and the editor's text. */
export async function locate(input: any, userText = ""): Promise<Located | null> {
  const link = (typeof input.maps_url === "string" && findMapsUrl(input.maps_url)) || null;
  const queries = [
    input.address,
    [input.label, input.address].filter(Boolean).join(", "),
    [input.label, input.city, input.region].filter(Boolean).join(", "),
  ].filter((q, i, a) => q && a.indexOf(q) === i);
  if (isFake()) {
    const hay = `${link || ""} ${queries.join(" ")} ${userText}`;
    const hit = FAKE.find(([re]) => re.test(hay));
    return hit ? { ...hit[1], ...(link ? { mapsUrl: link } : {}) } : null;
  }
  try {
    if (link) {
      const long = isShortMapsUrl(link) ? await expandMapsUrl(link) : link;
      const pos = coordsFromMapsUrl(long);
      if (pos) {
        // The state comes from OSM's reverse lookup only when the address didn't give it — keep it cheap.
        return { ...pos, mapsUrl: link, nameFromLink: nameFromMapsUrl(long) || undefined, source: "link" };
      }
    }
    for (const q of queries.slice(0, 3)) {
      const hit = await osmSearch(q);
      if (hit) return { ...hit, ...(link ? { mapsUrl: link } : {}), source: "osm" };
    }
  } catch (err: any) {
    logger.warn("locate failed", { message: String(err?.message || err) });
  }
  return null;
}

const stripHtml = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** A photo for a famous sight: Wikipedia's lead image, with the author and licence from Wikimedia Commons. */
export async function wikiPhoto(title: unknown): Promise<{ url: string; credit: string; page: string } | null> {
  if (typeof title !== "string" || !title.trim() || isFake()) return null;
  try {
    const res = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`);
    if (!res.ok) return null;
    const sum: any = await res.json();
    const original = String(sum?.originalimage?.source || "");
    const file = decodeURIComponent(original.split("/").pop() || "");
    if (!file || !/^https:\/\/upload\.wikimedia\.org\//.test(original)) return null;
    const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(`File:${file}`)}`);
    if (!info.ok) return null;
    const page: any = Object.values((await info.json())?.query?.pages || {})[0];
    const ii = page?.imageinfo?.[0];
    const url = String(ii?.thumburl || ii?.url || "");
    if (!/^https:\/\/upload\.wikimedia\.org\//.test(url)) return null;
    const artist = stripHtml(ii?.extmetadata?.Artist?.value || "").slice(0, 80);
    const license = stripHtml(ii?.extmetadata?.LicenseShortName?.value || "").slice(0, 40);
    const credit = [artist || "Wikimedia Commons", license].filter(Boolean).join(" · ").slice(0, 160);
    return { url, credit, page: String(ii?.descriptionurl || sum?.content_urls?.desktop?.page || "").slice(0, 500) || url };
  } catch {
    return null;
  }
}
