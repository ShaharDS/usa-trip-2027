// Google Maps links → a place's name and exact location. Pure (the browser uses it for a pasted long link; the
// server also expands short links — maps.app.goo.gl — first, then uses the same parsing).

const MAPS_LINK = /https:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^\s"'<>]*|maps\.google\.[a-z.]+[^\s"'<>]*|maps\.app\.goo\.gl\/[^\s"'<>]+|goo\.gl\/maps\/[^\s"'<>]+)/i;

/** The first Google Maps link in a text, or null. */
export function findMapsUrl(text) {
  const m = String(text || "").match(MAPS_LINK);
  return m ? m[0].replace(/[.,)]+$/, "") : null;
}

export const isShortMapsUrl = (url) => /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(url || ""));

const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Exact location from a long Google Maps link. The place's own pin (!3d…!4d…) wins over the map's centre (@lat,lng).
 * @returns {{lat: number, lng: number} | null}
 */
export function coordsFromMapsUrl(url) {
  let s = String(url || "");
  try {
    s = decodeURIComponent(s);
  } catch { /* keep as is */ }
  const tries = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of tries) {
    const m = s.match(re);
    if (m && valid(Number(m[1]), Number(m[2]))) return { lat: round(Number(m[1])), lng: round(Number(m[2])) };
  }
  return null;
}

/** "Hampton Inn Richmond" from ".../maps/place/Hampton+Inn+Richmond/@..." (or null). */
export function nameFromMapsUrl(url) {
  const m = String(url || "").match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, " ")).trim().slice(0, 80) || null;
  } catch {
    return null;
  }
}
