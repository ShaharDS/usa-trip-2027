// Review screen for an AI proposal: every change line with a checkbox, the effect on the total, sources,
// and approve / cancel. Nothing is saved until the editor approves.
import { h, icon, toast } from "../ui/h.js";
import { deltaSentence, fmtIls } from "../shared/format.js";
import { callFunction } from "../fb/api.js";
import { notice } from "./common.js";
import { routeMap } from "./map.js";
import { googlePlaceUrl } from "../shared/links.js";
import { PLACE_KIND_HE } from "../shared/schema.js";
import { dateHe } from "../shared/format.js";

function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "Is this the right place?" — name, kind, when, address, a Google Maps check link and the pins. */
function placesCheck(places) {
  if (!places?.length) return null;
  const when = (x) => (x.kind === "hotel" && x.checkIn ? `${dateHe(x.checkIn, "dm")} – ${dateHe(x.checkOut, "dm")}` : x.date ? `${dateHe(x.date, "dm")}${x.time ? ` · ${x.time}` : ""}` : "");
  return h("div", { class: "proposal-places" },
    h("p", { class: "meta" }, "בדקו שזה המקום הנכון:"),
    h("ol", { class: "legend" }, places.map((x, i) =>
      h("li", {},
        h("span", { class: "legend-n", style: { background: "#332288" } }, String(i + 1)),
        h("span", { class: "grow" },
          h("strong", { dir: "auto" }, x.label), h("span", { class: "meta" }, ` · ${PLACE_KIND_HE[x.kind] || ""}${when(x) ? ` · ${when(x)}` : ""}`),
          x.address ? h("span", { class: "place-address", dir: "auto", style: { display: "block" } }, x.address) : null,
          typeof x.lat === "number" ? null : h("span", { class: "meta", style: { display: "block" } }, "לא נמצא מיקום מדויק במפה (הניווט יהיה לפי הכתובת)."),
          googlePlaceUrl(x) ? h("a", { href: googlePlaceUrl(x), target: "_blank", rel: "noopener noreferrer" }, "לבדוק ב-Google Maps") : null)))),
    routeMap(places.map((x, i) => ({ lat: x.lat, lng: x.lng, n: i + 1, color: "#332288" })), { label: "המקומות בהצעה על המפה", height: 200, line: false }));
}

export function proposalCard(p, { onDone } = {}) {
  const box = h("section", { class: "card", "aria-live": "polite" });
  if (!p.lines?.length) {
    box.append(h("h2", {}, icon("sparkles"), "תשובת ה-AI"), h("p", { dir: "auto", style: { whiteSpace: "pre-wrap" } }, p.summaryHe || "לא נמצא מה לשנות."));
    return box;
  }
  const checks = p.lines.map(() => true);
  const status = h("div", {});
  const list = h("div", {}, p.lines.map((line, i) => {
    const id = `op-${p.proposalId}-${i}`;
    return h("label", { class: "proposal-op", for: id },
      h("input", { type: "checkbox", id, checked: true, onchange: (e) => { checks[i] = e.target.checked; } }),
      h("span", { dir: "auto" }, line));
  }));
  const approve = h("button", { type: "button", class: "btn" }, icon("check"), "אישור השינויים המסומנים");
  approve.addEventListener("click", async () => {
    const accept = checks.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    if (!accept.length) return toast("לא סומן אף שינוי");
    approve.disabled = true;
    try {
      const r = await callFunction("applyProposal", { proposalId: p.proposalId, accept });
      if (r.ok === false) {
        status.replaceChildren(notice(r.messageHe || "ההצעה כבר לא מתאימה.", "", "alert"));
        approve.disabled = false;
        return;
      }
      toast("השינויים נשמרו ✓");
      onDone?.(r);
    } catch (err) {
      status.replaceChildren(notice(err.message, "danger"));
      approve.disabled = false;
    }
  });
  const cancel = h("button", {
    type: "button", class: "btn btn-secondary",
    onclick: async () => {
      try {
        await callFunction("rejectProposal", { proposalId: p.proposalId });
      } catch { /* fine */ }
      toast("ההצעה בוטלה — לא נשמר כלום");
      onDone?.(null);
    },
  }, "ביטול");
  box.append(
    h("h2", {}, icon("sparkles"), "הצעה לשינוי — מחכה לאישור שלך"),
    p.summaryHe ? h("p", { dir: "auto", style: { whiteSpace: "pre-wrap" } }, p.summaryHe) : null,
    h("p", { class: "card-sub" }, typeof p.deltaIlsTyp === "number"
      ? `${Math.abs(p.deltaIlsTyp) < 50 ? "הסכום הכולל כמעט לא ישתנה" : `הסכום הכולל יהיה ${deltaSentence(p.deltaIlsTyp)}`}${p.totalAfterIls ? ` (כ-${fmtIls(p.totalAfterIls)})` : ""}.`
      : ""),
    h("p", { class: "meta" }, "סמנו מה לשמור:"),
    list,
    placesCheck(p.places),
    p.sources?.length
      ? h("ul", { class: "sources" }, p.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, icon("external", "icon-sm"), s.title && s.title !== s.url ? s.title : domain(s.url)))))
      : null,
    status,
    h("div", { class: "btn-row" }, approve, cancel));
  return box;
}
