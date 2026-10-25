// Editing the parts of the trip (a city, the road, the cruise) right on the route: name, type, state, note — and the
// dates on a calendar that shows who already sleeps where. Saving gives the part those nights and trims the parts it
// overlaps (shared/calendar.js assignRangeOps); the first save also turns the whole route into real dates.
import { h, icon } from "../ui/h.js";
import { addDays, diffDays } from "../shared/engine.js";
import { REGIONS, STOP_KIND_HE, STOP_KINDS, newId } from "../shared/schema.js";
import { ID_PREFIX } from "../shared/ops.js";
import { assignRangeOps, dayOwners, isExplicit, stopRanges } from "../shared/calendar.js";
import { dayMonthHe } from "../shared/format.js";
import { familyView } from "../shared/route.js";
import { askFirst } from "../components/common.js";
import { rangePicker } from "../components/rangePicker.js";
import { routeParts } from "../components/parts.js";
import { choices, compact, diffOp, errorBox, field, fieldset, textArea, textInput } from "./kit.js";
import { run } from "./tools.js";
import { store } from "../store.js";

const KIND_ICON = { city: "building", road: "route", parks: "ferris", cruise: "ship", beach: "palm", transit: "pin", other: "pin" };
const ui = { editId: null, draft: null };
const plan = () => store.docs.plan;
const scrollTo = (sel) => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);

/** Open the editor for a part ("new" = add one; `range` pre-selects nights, e.g. a gap). */
export function openPart(id, range = null) {
  const p = plan();
  const rec = id === "new" ? null : p?.stops?.[id];
  const r = id === "new" ? null : stopRanges(p).find((x) => x.id === id);
  ui.editId = id;
  ui.draft = {
    label: rec?.label || "", kind: rec?.kind || "city", region: rec?.region || "", note: rec?.note || "",
    first: range?.from || (r?.nights ? r.start : null),
    last: range?.to || (r?.nights ? addDays(r.start, r.nights - 1) : null),
  };
  scrollTo("#part-editor");
}

export const closePart = () => { ui.editId = null; ui.draft = null; };

/** Who sleeps on each night, for the picker (the part being edited is left out). */
function ownersFor(id) {
  const p = plan();
  const { byStop } = routeParts(familyView(p));
  const map = Object.fromEntries(dayOwners(p).map((d) => [d.date, d.owners.filter((o) => o !== id).map((o) => byStop[o] || { label: p.stops?.[o]?.label || "", color: "#525B73" })]));
  return (date) => map[date] || [];
}

/** The inline editor (or null when this part isn't being edited). */
export function partEditor(ctx, id) {
  if (ui.editId !== id || !ui.draft) return null;
  const p = plan();
  const d = ui.draft;
  const isNew = id === "new";
  const s = p.settings || {};
  const errors = errorBox();
  const preview = h("div", { class: "item-explain", "aria-live": "polite" });
  const refresh = () => {
    if (!d.first || !d.last) {
      preview.replaceChildren("בחרו בלוח את הלילה הראשון ואת הלילה האחרון.");
      return;
    }
    try {
      const { overridden } = assignRangeOps(p, isNew ? "__new" : id, d.first, d.last, isNew ? { id: "__new", v: {} } : null);
      preview.replaceChildren(
        h("strong", {}, `${dayMonthHe(d.first)} – ${dayMonthHe(d.last)} · ${diffDays(d.first, d.last) + 1} לילות`),
        ...overridden.map((o) => h("div", { class: "opt-warn" }, icon("alert"),
          h("span", {}, `${o.from === o.to ? dayMonthHe(o.from) : `${dayMonthHe(o.from)}–${dayMonthHe(o.to)}`} כרגע של ״${o.label}״ — יעברו לחלק הזה (״${o.label}״ יתקצר).`))));
    } catch (err) {
      preview.replaceChildren(err.message);
    }
  };
  const save = async (btn) => {
    if (!d.label.trim()) return errors.show(["כתבו שם לחלק (למשל: וושינגטון)."]);
    if (!d.first || !d.last) return errors.show(["בחרו תאריכים בלוח."]);
    const meta = compact({ label: d.label.trim(), kind: d.kind, icon: KIND_ICON[d.kind] || "pin", region: d.region, note: d.note.trim() });
    let ops;
    if (isNew) {
      const newIdv = newId(ID_PREFIX.stops);
      ops = assignRangeOps(p, newIdv, d.first, d.last, { id: newIdv, v: meta }).ops;
    } else {
      const r = stopRanges(p).find((x) => x.id === id);
      const sameDates = r && r.nights && r.start === d.first && addDays(r.start, r.nights - 1) === d.last && isExplicit(p);
      ops = sameDates ? [] : assignRangeOps(p, id, d.first, d.last).ops;
      const rec = p.stops[id];
      const metaOp = diffOp("stops", id, rec, { ...rec, ...meta, region: meta.region ?? null, note: meta.note ?? null }, ["label", "kind", "icon", "region", "note"]);
      if (metaOp) ops.push(metaOp);
    }
    if (!ops.length) {
      closePart();
      return ctx.rerender();
    }
    btn.disabled = true;
    try {
      await run(ops, { doneText: isNew ? `״${meta.label}״ נוסף למסלול` : "המסלול עודכן" });
      closePart();
      ctx.rerender();
    } catch (err) {
      btn.disabled = false;
      errors.show(err.errors?.length ? err.errors : [err.message]);
    }
  };
  refresh();
  return h("div", { class: "inline-form", id: "part-editor" },
    h("h3", {}, icon(isNew ? "plus" : "edit"), isNew ? " חלק חדש במסלול" : ` עריכת ״${p.stops[id]?.label || ""}״`),
    errors,
    field("שם", textInput(d.label, (v) => { d.label = v; }, { placeholder: "למשל: וושינגטון", maxlength: 60 })),
    fieldset("תאריכים — מתי ישנים שם", rangePicker({
      from: s.startDate, to: addDays(s.endDate, -1), owners: ownersFor(id), first: d.first, last: d.last,
      label: "בחירת הלילות של החלק הזה",
      onChange: (a, b) => { d.first = a; d.last = b; refresh(); },
    }), "כל יום בלוח מראה מי כבר ישן שם. אפשר לבחור גם ימים תפוסים — הם יעברו לחלק הזה."),
    preview,
    fieldset("סוג", choices(STOP_KINDS.map((k) => ({ value: k, label: STOP_KIND_HE[k], icon: KIND_ICON[k] })), d.kind, (v) => { d.kind = v; }, { label: "סוג" })),
    fieldset("מדינה בארה״ב", choices([{ value: "", label: "כמה מדינות / בלי" }, ...Object.entries(REGIONS).map(([code, r]) => ({ value: code, label: r.he }))], d.region || "", (v) => { d.region = v; }, { label: "מדינה" })),
    field("הערה (רואה כל המשפחה)", textArea(d.note, (v) => { d.note = v; }, { rows: 2, maxlength: 300 })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: (e) => save(e.currentTarget) }, icon("check"), isNew ? "הוספה למסלול" : "שמירה"),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { closePart(); ctx.rerender(); } }, "ביטול"),
      isNew ? null : h("button", {
        type: "button", class: "btn btn-danger",
        onclick: askFirst(p.stops[id]?.label, async () => {
          try {
            await run([{ t: "archive", e: "stops", id }], { doneText: `״${p.stops[id]?.label}״ נמחק מהמסלול` });
            closePart();
            ctx.rerender();
          } catch { /* the toast said why */ }
        }, "הלילות שלו יישארו בלי חלק (״לא משויך״) עד שתשייכו אותם."),
      }, icon("trash"), "מחיקה")));
}

/** "עריכה" on a part's header. */
export function partEditButton(ctx, stopId) {
  return h("button", { type: "button", class: "edit-btn", onclick: () => { openPart(stopId); ctx.rerender(); } }, icon("edit", "icon-sm"), "עריכה");
}

/** "+ הוספת חלק" — at the end of the route, or for nights that belong to nobody. */
export function addPartButton(ctx, range = null) {
  return h("button", {
    type: "button", class: range ? "btn btn-secondary" : "btn",
    onclick: () => { openPart("new", range); ctx.rerender(); },
  }, icon("plus"), range ? "לשייך את הימים האלה לחלק חדש" : "הוספת חלק למסלול (עיר, נסיעה, שייט…)");
}
