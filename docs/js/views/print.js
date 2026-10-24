// A plain one-page summary for printing (or saving as PDF from the browser).
import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { STATUS_HE } from "../shared/schema.js";
import { approxIls, dateHe, dateRangeHe, explainHe, fmtIls, fmtUsd, nightsHe } from "../shared/format.js";
import { backLink } from "../components/common.js";

export function renderPrint(ctx) {
  const { state, r } = ctx;
  const s = state.settings;
  const cell = { padding: "6px 8px", borderBottom: "1px solid #DCE1E9", verticalAlign: "top" };
  const rows = [];
  for (const cat of r.categories) {
    rows.push(h("tr", {}, h("th", { colspan: "4", style: { ...cell, textAlign: "start", background: "#F2F4F8" } }, `${cat.label} — ${approxIls(cat.amount.ils.typ)}`)));
    for (const item of activeList(state.items).filter((i) => i.categoryId === cat.id && r.items[i.id].included)) {
      const res = r.items[item.id];
      rows.push(h("tr", {},
        h("td", { style: cell }, item.label),
        h("td", { style: { ...cell, fontSize: "15px" } }, explainHe(res, state)),
        h("td", { style: cell }, STATUS_HE[item.status]),
        h("td", { style: { ...cell, whiteSpace: "nowrap" } }, fmtIls(res.amount.ils.typ), h("br"), h("span", { class: "meta" }, fmtUsd(res.amount.usd.typ)))));
    }
  }
  for (const a of r.adjustments) {
    rows.push(h("tr", {}, h("td", { style: cell, colspan: "3" }, a.id === "buffer" ? `רזרבה (${a.pct}%)` : `עמלות כרטיס (${a.pct}%)`), h("td", { style: cell }, fmtIls(a.amount.ils.typ))));
  }
  return [
    h("div", { class: "no-print" }, backLink(), h("button", { type: "button", class: "btn", onclick: () => window.print(), style: { marginInlineStart: "8px" } }, icon("print"), "הדפסה")),
    h("section", { class: "card" },
      h("h1", {}, s.title),
      h("p", {}, `${dateRangeHe(s.startDate, s.endDate)} ${s.endDate.slice(0, 4)} · ${r.people.everyone} נוסעים · ${nightsHe(r.itinerary.tripNights)}`),
      h("p", { style: { fontSize: "26px", fontWeight: 900 } }, `סה״כ: ${approxIls(r.total.ils.typ)} (בערך ${fmtUsd(r.total.usd.typ)})`),
      h("p", { class: "meta" }, `לפי שער ${s.fx.planningRate} ₪ לדולר. הודפס ב-${dateHe(new Date().toISOString().slice(0, 10), "dmy")}.`),
      h("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "16px" } }, h("tbody", {}, rows))),
    h("section", { class: "card" },
      h("h2", {}, "המסלול"),
      h("ul", {}, r.itinerary.stops.filter((st) => st.nights > 0).map((st) => h("li", {}, `${st.label}: ${dateRangeHe(st.start, st.end)} (${nightsHe(st.nights)})`)))),
  ];
}
