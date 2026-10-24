import { h, icon } from "../ui/h.js";
import { dateHe, fmtNum, relativeHe } from "../shared/format.js";
import { store } from "../store.js";

export function footer(ctx) {
  const s = ctx.state.settings;
  const fx = s.fx || {};
  const today = store.fxToday;
  return h("footer", { class: "foot" },
    h("p", {}, `החישוב בשקלים לפי שער של ${fmtNum(fx.planningRate, 2)} ₪ לדולר${fx.planningRateDate ? ` (נקבע ב-${dateHe(fx.planningRateDate, "dmy")})` : ""}.`,
      today ? ` שער היום: ${fmtNum(today.rate, 2)} ₪.` : ""),
    s.notIncluded?.length ? h("div", {}, h("p", { style: { margin: 0 } }, "לא כלול בחישוב:"), h("ul", {}, s.notIncluded.map((x) => h("li", {}, x)))) : null,
    s.contactText ? h("p", {}, s.contactText) : null,
    h("p", {},
      h("a", { href: "#/print" }, icon("print", "icon-sm"), " גרסה להדפסה"),
      ctx.state.updatedAt ? ` · עודכן ${relativeHe(ctx.state.updatedAt)}` : "",
      ctx.state.version ? ` · גרסה ${ctx.state.version}` : ""));
}
