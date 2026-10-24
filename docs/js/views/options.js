import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { backLink, emptyState, pageHead } from "../components/common.js";
import { optionRows } from "./home.js";
import { can } from "../store.js";

export function renderOptions(ctx, groupId) {
  const g = ctx.state.optionGroups?.[groupId];
  if (!g || g.archived) return [backLink(), pageHead("לא מצאנו את השאלה"), emptyState("ייתכן שהיא הוסרה.")];
  const editing = can.edit() && ctx.editMode;
  const count = activeList(ctx.state.options).filter((o) => o.groupId === groupId).length;
  return [
    backLink(),
    pageHead(g.label, h("span", { class: "chip-icon", style: { background: "#E6EFF8", color: "#0B5CAD" } }, icon("list"))),
    h("section", { class: "card" },
      g.question ? h("p", { class: "card-sub", dir: "auto" }, g.question) : null,
      h("p", { class: "meta" }, `${count} אפשרויות. הסכום הכולל באתר מחושב לפי האפשרות המסומנת. ליד כל אפשרות אחרת רואים כמה הטיול כולו היה עולה איתה.`),
      optionRows(ctx, groupId, { withChoose: editing }),
      editing ? ctx.editTools?.optionGroup(ctx, g) : null),
  ];
}
