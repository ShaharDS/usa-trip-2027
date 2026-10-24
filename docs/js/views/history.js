// Change history: who changed what, when; editors can undo a change.
import { h, icon } from "../ui/h.js";
import { relativeHe, signedIls } from "../shared/format.js";
import { backLink, emptyState, notice, pageHead } from "../components/common.js";
import { localHistory } from "../data/commit.js";
import { readChanges } from "../data/live.js";
import { undoChange } from "../edit/tools.js";
import { can, store } from "../store.js";

const SOURCE_HE = { manual: "עריכה", ai: "הצעת AI", undo: "ביטול", system: "מערכת" };

function changeRow(c) {
  return h("li", { style: { alignItems: "flex-start" } },
    icon(c.source === "ai" ? "sparkles" : c.source === "undo" ? "undo" : "edit"),
    h("div", { class: "grow" },
      h("div", { dir: "auto" }, c.summary),
      h("div", { class: "meta" },
        `${SOURCE_HE[c.source] || ""}${c.by?.label ? ` · ${c.by.label}` : ""}${c.approvedBy ? ` · אושר ע״י ${c.approvedBy}` : ""} · ${relativeHe(c.at)}`,
        typeof c.deltaIlsTyp === "number" && Math.abs(c.deltaIlsTyp) >= 50 ? ` · ${signedIls(c.deltaIlsTyp)}` : "",
        c.undoneBy ? " · בוטל" : ""),
      can.edit() && !c.undoneBy && c.source !== "system"
        ? h("button", { type: "button", class: "edit-btn", style: { marginTop: "6px" }, onclick: () => undoChange(c.id) }, icon("undo", "icon-sm"), "ביטול השינוי")
        : null));
}

export function renderHistory() {
  if (!can.edit()) return [backLink(), pageHead("היסטוריית שינויים"), notice("ההיסטוריה פתוחה רק לעורכי הטיול.", "info", "lock")];
  const list = h("ul", { class: "check-list" });
  if (store.demo) {
    const items = localHistory();
    if (items.length) list.replaceChildren(...items.map(changeRow));
    else list.replaceChildren(h("li", {}, emptyState("עוד לא היו שינויים (במצב הדגמה השינויים נשמרים רק עד רענון הדף).")));
  } else {
    list.replaceChildren(h("li", {}, h("span", { class: "meta" }, "טוען…")));
    readChanges(60)
      .then((items) => list.replaceChildren(...(items.length ? items.map(changeRow) : [h("li", {}, emptyState("עוד לא היו שינויים."))])))
      .catch(() => list.replaceChildren(h("li", {}, notice("לא הצלחנו לטעון את ההיסטוריה.", "danger"))));
  }
  return [backLink(), pageHead("היסטוריית שינויים"), h("section", { class: "card" }, list)];
}
