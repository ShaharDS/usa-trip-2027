// A small route map: numbered pins and a dashed line between them, on OpenStreetMap's map tiles (free for
// light use like a family's, with the credit line under the map). Leaflet is bundled in docs/vendor and loads only on screens that show a map. On a phone the map does
// not grab the page's scrolling: moving / zooming it starts with the "להזיז את המפה" button. If the map can't
// load (no connection), the numbered list under it still says everything.
import { h, icon } from "../ui/h.js";

const BASE = "vendor/leaflet-1.9.4/";
let leafletP = null;

function loadLeaflet() {
  leafletP ??= new Promise((resolve, reject) => {
    if (globalThis.L?.map) return resolve(globalThis.L);
    document.head.append(h("link", { rel: "stylesheet", href: `${BASE}leaflet.css` }));
    const s = h("script", { src: `${BASE}leaflet.js` });
    s.onload = () => resolve(globalThis.L);
    s.onerror = () => { leafletP = null; reject(new Error("leaflet")); };
    document.head.append(s);
  });
  return leafletP;
}

// One live map per set of points: a background update that re-renders the page re-uses it (no tile reload).
const cache = new Map();

/**
 * @param {Array<{lat: number, lng: number, n: number|string, color: string}>} points
 * @param {{label: string, line?: boolean, height?: number}} opts
 */
export function routeMap(points, { label, line = true, height = 260 } = {}) {
  const pts = points.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  if (!pts.length) return null;
  const key = JSON.stringify([pts.map((p) => [p.lat, p.lng, p.n, p.color]), line, height]);
  const hit = cache.get(key);
  if (hit && !hit.wrap.isConnected) {
    setTimeout(() => hit.map?.invalidateSize(), 0);
    return hit.wrap;
  }

  const box = h("div", { class: "map", dir: "ltr", style: { height: `${height}px` }, role: "img", "aria-label": label });
  const moveLabel = h("span", {}, "להזיז ולהגדיל את המפה");
  const entry = { map: null, wrap: null, moving: false };
  const move = h("button", {
    type: "button", class: "btn btn-ghost map-move", "aria-pressed": "false",
    onclick: () => {
      if (!entry.map) return;
      entry.moving = !entry.moving;
      for (const handler of ["dragging", "touchZoom", "doubleClickZoom"]) entry.map[handler][entry.moving ? "enable" : "disable"]();
      move.setAttribute("aria-pressed", entry.moving ? "true" : "false");
      moveLabel.textContent = entry.moving ? "לסיים להזיז (חזרה לגלילה)" : "להזיז ולהגדיל את המפה";
    },
  }, icon("move", "icon-sm"), moveLabel);
  const credit = h("p", { class: "map-credit" }, "מפה: ",
    h("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener noreferrer" }, "© OpenStreetMap"));
  entry.wrap = h("div", { class: "map-wrap" }, box, h("div", { class: "row-between wrap" }, move, credit));
  cache.set(key, entry);
  if (cache.size > 12) cache.delete(cache.keys().next().value);

  setTimeout(() => {
    loadLeaflet().then((L) => {
      if (entry.map) return;
      const map = L.map(box, {
        attributionControl: false, scrollWheelZoom: false, dragging: false, touchZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.5,
      });
      entry.map = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      const latlngs = pts.map((p) => [p.lat, p.lng]);
      if (line && pts.length > 1) L.polyline(latlngs, { color: "#1F2641", weight: 3, opacity: 0.55, dashArray: "6 8" }).addTo(map);
      for (const p of pts) {
        // Our own numbers (or ⌂ for a hotel) and palette colours only — no outside text goes into this HTML.
        const html = `<span class="pin-dot" style="background:${String(p.color).replace(/[^#0-9A-Fa-f]/g, "")}">${String(p.n).replace(/[^0-9A-Za-z⌂]/g, "")}</span>`;
        L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "pin", html, iconSize: [32, 32], iconAnchor: [16, 16] }), interactive: false, keyboard: false }).addTo(map);
      }
      if (pts.length === 1) map.setView(latlngs[0], 13);
      else map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 13 });
    }).catch(() => {
      box.replaceChildren(h("p", { class: "meta map-fallback" }, "המפה לא נטענה (אין חיבור?). הרשימה למטה מראה את אותו הדבר."));
    });
  }, 0);
  return entry.wrap;
}
