// Home-page layout editing: every section gets a small toolbar (move, hide/show, edit).
import { h, icon } from "../ui/h.js";
import { SECTION_HE } from "../shared/schema.js";
import { moveOps, run } from "./tools.js";

export function sectionTools(ctx, section, node, sections) {
  const i = sections.findIndex((s) => s.id === section.id);
  const name = section.title || SECTION_HE[section.type] || section.type;
  const bar = h("div", { class: "row-between wrap", style: { gap: "8px", marginBottom: "8px" } },
    h("strong", { style: { fontSize: "16px" } }, icon("eye", "icon-sm"), ` ${name}`, section.visible ? "" : " (מוסתר)"),
    h("div", { class: "row wrap", style: { gap: "6px" } },
      h("button", { type: "button", class: "edit-btn", disabled: i === 0, onclick: () => run(moveOps("sections", sections, section.id, -1)) }, icon("up", "icon-sm"), "למעלה"),
      h("button", { type: "button", class: "edit-btn", disabled: i === sections.length - 1, onclick: () => run(moveOps("sections", sections, section.id, 1)) }, icon("down", "icon-sm"), "למטה"),
      h("button", {
        type: "button", class: "edit-btn",
        onclick: () => run([{ t: "update", e: "sections", id: section.id, set: { visible: !section.visible }, before: { visible: section.visible ?? null } }], { doneText: section.visible ? "החלק הוסתר" : "החלק מוצג" }),
      }, icon("eye", "icon-sm"), section.visible ? "הסתרה" : "הצגה"),
      h("a", { class: "edit-btn", href: `#/edit/section/${encodeURIComponent(section.id)}` }, icon("edit", "icon-sm"), "עריכה")));
  return h("div", { style: { border: "2px dashed #8A93A6", borderRadius: "20px", padding: "10px", margin: "0 0 16px", opacity: section.visible ? 1 : 0.6 } },
    bar,
    node || h("p", { class: "meta" }, "החלק הזה ריק כרגע (אין בו מה להציג)."));
}

sectionTools.addButton = () =>
  h("div", { class: "btn-row", style: { marginBottom: "16px" } },
    h("a", { class: "btn btn-secondary", href: "#/edit/section/new" }, icon("plus"), "הוספת חלק לעמוד הבית"),
    h("a", { class: "btn btn-secondary", href: "#/edit/category/new" }, icon("plus"), "קטגוריה חדשה"));
