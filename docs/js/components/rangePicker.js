// Picking dates on a calendar: tap the first night, then the last night. Every night shows who already sleeps
// there (colour + name), so you see what you're about to override — and you still can. Big cells, no dragging.
import { h, icon, tint } from "../ui/h.js";
import { addDays, diffDays } from "../shared/engine.js";
import { dateHe, dayMonthHe, nightsHe, weekdayLetterHe } from "../shared/format.js";

const WEEK = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * @param {{from: string, to: string, owners: (date: string) => Array<{label: string, color: string}>,
 *          first?: string|null, last?: string|null, onChange: (first: string|null, last: string|null) => void,
 *          selfColor?: string, label?: string}} o
 *   from / to = the first and the last night that may be picked.
 */
export function rangePicker(o) {
  let first = o.first || null;
  let last = o.last || null;
  let waiting = !!(first && !last);
  const wrap = h("div", { class: "rp" });
  const draw = () => {
    const start = addDays(o.from, -dow(o.from));
    const end = addDays(o.to, 6 - dow(o.to));
    const cells = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const inFrame = d >= o.from && d <= o.to;
      const chosen = first && (last ? d >= first && d <= last : d === first);
      const who = inFrame ? o.owners(d) : [];
      const main = who[0];
      cells.push(h("button", {
        type: "button", class: ["rp-c", inFrame ? "" : "rp-out", chosen ? "rp-on" : ""], disabled: !inFrame,
        style: chosen ? { background: o.selfColor || "#0B5CAD", borderColor: o.selfColor || "#0B5CAD" } : main ? { borderTopColor: main.color, background: tint(main.color, 0.08) } : {},
        "aria-pressed": chosen ? "true" : "false",
        "aria-label": `${dateHe(d, "long")}${who.length ? ` — ${who.map((w) => w.label).join(", ")}` : " — פנוי"}`,
        onclick: () => {
          if (!first || !waiting) {
            first = d;
            last = null;
            waiting = true;
          } else {
            if (d < first) [first, last] = [d, first];
            else last = d;
            waiting = false;
          }
          draw();
          o.onChange(first, waiting ? null : last);
        },
      },
      h("span", { class: "rp-d num" }, dayMonthHe(d)),
      inFrame && who.length && !chosen ? h("span", { class: "rp-who", style: { color: main.color } }, who.length > 1 ? `${main.label} +` : main.label) : null,
      inFrame && !who.length && !chosen ? h("span", { class: "rp-free" }, "פנוי") : null));
    }
    const nights = first && last ? diffDays(first, last) + 1 : first ? 1 : 0;
    wrap.replaceChildren(
      h("div", { class: "rp-grid", "aria-label": o.label || "בחירת תאריכים" },
        WEEK.map((w) => h("span", { class: "rp-h", "aria-hidden": "true" }, w)),
        cells),
      h("p", { class: "rp-sum", "aria-live": "polite" },
        icon("calendar", "icon-sm"), " ",
        !first
          ? "לחצו על הלילה הראשון."
          : waiting
            ? `מ-${dateHe(first, "dm")} — עכשיו לחצו על הלילה האחרון (או שוב על אותו יום ללילה אחד).`
            : `${weekdayLetterHe(first)} ${dayMonthHe(first)} – ${weekdayLetterHe(last)} ${dayMonthHe(last)} · ${nightsHe(nights)} (יוצאים ב-${dayMonthHe(addDays(last, 1))})`));
  };
  draw();
  return wrap;
}

