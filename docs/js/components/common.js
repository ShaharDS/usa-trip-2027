// Small building blocks shared by the screens.
import { h, icon, tint } from "../ui/h.js";
import { COLORS, STATUS_HE } from "../shared/schema.js";
import { approxIls, dateHe, fmtIls, fmtUsd, rangeIls, warningHe } from "../shared/format.js";
import { SITE_URL } from "../config.js";

const STATUS_ICON = { paid: "done", booked: "check", quote: "file", estimate: "clock" };

export function statusBadge(status) {
  return h("span", { class: `badge badge-${status}` }, icon(STATUS_ICON[status] || "clock"), STATUS_HE[status] || status);
}

export function catColor(cat) {
  return COLORS[cat?.color] || COLORS.slate;
}

export function catChip(cat, size = "") {
  const color = catColor(cat);
  return h("span", { class: `chip-icon ${size}`, style: { background: tint(color), color } }, icon(cat?.icon || "star"));
}

/** Money for a row/category: approximate unless final. `final` = paid/booked with an actual amount. */
export function ilsText(amount, final) {
  return final ? fmtIls(amount.ils.typ) : approxIls(amount.ils.typ);
}

export function backLink(href = "#/", label = "חזרה") {
  return h("a", { class: "back", href }, icon("back", "icon-sm"), label);
}

export function pageHead(title, iconNode) {
  return h("div", { class: "page-head" }, iconNode || null, h("h1", {}, title));
}

export function notice(text, kind = "", iconName = "alert") {
  return h("div", { class: `notice ${kind ? `notice-${kind}` : ""}`, role: kind === "danger" ? "alert" : null }, icon(iconName), h("div", {}, text));
}

export function warningsBlock(warnings, state) {
  if (!warnings?.length) return null;
  const unique = [...new Map(warnings.map((w) => [JSON.stringify(w), w])).values()];
  return h("div", {}, unique.map((w) => notice(warningHe(w, state))));
}

export function usdLine(amount) {
  const { low, typ, high } = amount.usd;
  return Math.round(low) === Math.round(high) ? fmtUsd(typ) : `${fmtUsd(typ)} (${fmtUsd(low)}–${fmtUsd(high)})`;
}

export function rangeLine(amount) {
  return rangeIls(amount.ils.low, amount.ils.high);
}

/** WhatsApp share: the phone's share sheet when available, else a wa.me link. Text never contains the total. */
export function shareButton(cls = "btn btn-secondary") {
  const text = "✈️🏨🚗🎢🚢 הטיול המשפחתי לארה״ב — כמה זה עולה? הסיכום המעודכן כאן:";
  const url = SITE_URL;
  return h(
    "button",
    {
      type: "button",
      class: cls,
      onclick: async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: "הטיול לארה״ב", text, url });
            return;
          } catch {
            /* cancelled — fall through to WhatsApp */
          }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
      },
    },
    icon("share"),
    "שיתוף בוואטסאפ",
  );
}

export function emptyState(text) {
  return h("p", { class: "muted" }, text);
}

export function checklistItems(list) {
  return h("ul", { class: "check-list" }, list.map((t) =>
    h("li", {},
      h("span", { class: `check-box ${t.done ? "on" : ""}`, role: "img", "aria-label": t.done ? "בוצע" : "עוד לא" }, t.done ? icon("check") : null),
      h("span", { class: t.done ? "done-text" : "" }, t.label, t.dueDate ? h("span", { class: "meta" }, ` · עד ${dateHe(t.dueDate, "dm")}`) : null))));
}
