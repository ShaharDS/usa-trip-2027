// Navigation links for places on the route. On a phone they open the Waze / Google Maps app (or the website
// elsewhere). Pure: builds URLs only, from what the place has — exact location, address, or name + city.

const enc = encodeURIComponent;
const hasPos = (p) => typeof p?.lat === "number" && typeof p?.lng === "number";

/** "Hampton Inn Richmond, 700 E Main St, Richmond, VA" — what Google searches for. */
export function placeQuery(p) {
  if (!p) return "";
  return [p.label, p.address || [p.city, p.region].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}

/** Waze: straight to driving. Exact location when known (Waze's search is weak outside the US/Israel). */
export function wazeUrl(p) {
  if (hasPos(p)) return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
  const q = p?.address ? `${p.address}` : placeQuery(p);
  return q ? `https://waze.com/ul?q=${enc(q)}&navigate=yes` : null;
}

/** Google Maps directions to the place (by name + address, so Google finds the business, not only a pin). */
export function googleMapsUrl(p) {
  const q = placeQuery(p) || (hasPos(p) ? `${p.lat},${p.lng}` : "");
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}&travelmode=driving` : null;
}

/** The place itself on Google Maps (photos, hours, reviews). */
export function googlePlaceUrl(p) {
  if (p?.mapsUrl) return p.mapsUrl;
  const q = placeQuery(p) || (hasPos(p) ? `${p.lat},${p.lng}` : "");
  return q ? `https://www.google.com/maps/search/?api=1&query=${enc(q)}` : null;
}

const point = (p) => placeQuery(p) || (hasPos(p) ? `${p.lat},${p.lng}` : "");

/**
 * The whole day in Google Maps: from last night's hotel, through today's places in order, to tonight's hotel.
 * Phones take at most 3 stops in between, so a longer day is split into parts.
 * @returns {Array<{url: string, from: string, to: string}>}
 */
export function dayRouteUrls(day, maxStops = 3) {
  // Flights aren't driven — except the drive to the airport on a day that ends with no hotel (flying home).
  // A day at the same hotel loops back to it; the same place twice in a row is one stop.
  const flyOut = !day.sleep ? day.places.filter((p) => p.kind === "flight").at(-1) : null;
  const stops = [day.woke, ...day.places.filter((p) => !p.maybe && p.kind !== "flight"), day.sleep || flyOut]
    .filter((p) => p && point(p))
    .filter((p, i, arr) => i === 0 || arr[i - 1].id !== p.id);
  if (stops.length < 2) return [];
  const legs = [];
  let i = 0;
  while (i < stops.length - 1) {
    const end = Math.min(i + maxStops + 1, stops.length - 1);
    const via = stops.slice(i + 1, end);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${enc(point(stops[i]))}&destination=${enc(point(stops[end]))}`
      + `${via.length ? `&waypoints=${via.map((p) => enc(point(p))).join("%7C")}` : ""}&travelmode=driving`;
    legs.push({ url, from: stops[i].label || stops[i].city || "", to: stops[end].label || stops[end].city || "" });
    i = end;
  }
  return legs;
}
