// Itinerary editing buttons on the route screen.
import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { moveOps, run } from "./tools.js";
import { askFirst } from "../components/common.js";

export function stopTools(ctx, stop) {
  const stops = activeList(ctx.state.stops);
  const i = stops.findIndex((s) => s.id === stop.id);
  return h("div", { class: "btn-row", style: { marginTop: "6px" } },
    h("a", { class: "edit-btn", href: `#/edit/stop/${encodeURIComponent(stop.id)}` }, icon("edit", "icon-sm"), "עריכה"),
    h("button", { type: "button", class: "edit-btn", disabled: i <= 0, onclick: () => run(moveOps("stops", stops, stop.id, -1)) }, icon("up", "icon-sm"), "למעלה"),
    h("button", { type: "button", class: "edit-btn", disabled: i === stops.length - 1, onclick: () => run(moveOps("stops", stops, stop.id, 1)) }, icon("down", "icon-sm"), "למטה"),
    h("button", { type: "button", class: "edit-btn", onclick: askFirst(stop.label, () => run([{ t: "archive", e: "stops", id: stop.id }], { doneText: `"${stop.label}" הוסר מהמסלול` }).catch(() => {})) }, icon("archive", "icon-sm"), "הסרה"));
}

stopTools.addButton = () =>
  h("div", { class: "btn-row" }, h("a", { class: "btn", href: "#/edit/stop/new" }, icon("plus"), "הוספת עיר או עצירה"));
