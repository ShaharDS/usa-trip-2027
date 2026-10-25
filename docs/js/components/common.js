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

/** WhatsApp share: the phone's share sheet when available, else a wa.me link. The link opens the route (no prices). */
export function shareButton(cls = "btn btn-secondary") {
  const text = "✈️🏨🚗🎢🚢 הטיול המשפחתי לארה״ב — המסלול המעודכן כאן:";
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

/**
 * "בטוחים?" before something is removed. Resolves true only when the red button is pressed; ביטול, Esc and a tap
 * outside the box all answer false. Falls back to the browser's confirm() where <dialog> is missing.
 */
export function confirmDialog({ title = "בטוחים?", text = "", confirmLabel = "כן, למחוק", cancelLabel = "ביטול" } = {}) {
  if (typeof HTMLDialogElement === "undefined" || !document.createElement("dialog").showModal) {
    return Promise.resolve(window.confirm(text ? `${title}\n${text}` : title));
  }
  return new Promise((resolve) => {
    let answer = false;
    const close = (value) => { answer = value; dlg.close(); };
    const cancel = h("button", { type: "button", class: "btn btn-secondary", onclick: () => close(false) }, cancelLabel);
    const dlg = h("dialog", { class: "confirm", "aria-labelledby": "confirm-title", "aria-describedby": text ? "confirm-text" : null },
      h("div", { class: "confirm-body" },
        h("span", { class: "confirm-icon" }, icon("trash")),
        h("h2", { id: "confirm-title" }, title),
        text ? h("p", { id: "confirm-text", class: "meta" }, text) : null,
        h("div", { class: "btn-row" },
          h("button", { type: "button", class: "btn btn-danger-solid", onclick: () => close(true) }, icon("trash"), confirmLabel),
          cancel)));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(false); }); // tap on the dimmed backdrop
    dlg.addEventListener("close", () => { dlg.remove(); resolve(answer); });
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus();
  });
}

/** The usual removal question: names the thing and says it can be undone. */
export function confirmRemove(name, extra = "") {
  return confirmDialog({
    title: name ? `בטוחים שרוצים למחוק את ״${name}״?` : "בטוחים שרוצים למחוק?",
    text: `${extra ? `${extra} ` : ""}אם התחרטתם, אפשר לבטל מיד בהודעה שלמטה או דרך ״היסטוריה״.`,
  });
}

/** onclick handler that asks first, then runs `fn`. `name` may be a function (read when tapped). */
export const askFirst = (name, fn, extra) => async () => {
  if (await confirmRemove(typeof name === "function" ? name() : name, extra)) return fn();
};

export function emptyState(text) {
  return h("p", { class: "muted" }, text);
}

/** To-do rows. With `onToggle` (editors) every row is one big tap target that ticks / unticks it. */
export function checklistItems(list, { onToggle } = {}) {
  return h("ul", { class: "check-list" }, list.map((t) => {
    const text = h("span", { class: t.done ? "done-text" : "" }, t.label, t.dueDate ? h("span", { class: "meta" }, ` · עד ${dateHe(t.dueDate, "dm")}`) : null);
    if (!onToggle) {
      return h("li", {},
        h("span", { class: `check-box ${t.done ? "on" : ""}`, role: "img", "aria-label": t.done ? "בוצע" : "עוד לא" }, t.done ? icon("check") : null),
        text);
    }
    return h("li", { class: "check-li" },
      h("button", { type: "button", class: "check-toggle", role: "checkbox", "aria-checked": t.done ? "true" : "false", onclick: () => onToggle(t) },
        h("span", { class: `check-box ${t.done ? "on" : ""}`, "aria-hidden": "true" }, t.done ? icon("check") : null),
        text));
  }));
}
