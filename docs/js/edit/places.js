// Editing the day-by-day route, inside the day itself: "+ הוספת מקום" opens a box under the day's places.
// The AI comes first — type or say a hotel's name, a place, or paste a Google Maps link, and it finds the address
// and the exact location (a proposal to approve). By hand works too. Editing a place opens the same form inside
// its row; removing asks first. What is typed lives in `ui` (outside the render) so background updates keep it.
import { h, icon } from "../ui/h.js";
import { addDays, activeList } from "../shared/engine.js";
import { PLACE_KIND_HE, PLACE_KIND_ICON, PLACE_KINDS, REGIONS, newId } from "../shared/schema.js";
import { ID_PREFIX } from "../shared/ops.js";
import { dayId } from "../shared/days.js";
import { coordsFromMapsUrl, isShortMapsUrl, nameFromMapsUrl } from "../shared/geo.js";
import { askFirst, notice } from "../components/common.js";
import { proposalCard } from "../components/proposal.js";
import { micButton, micHint } from "../components/voice.js";
import { callFunction } from "../fb/api.js";
import { choices, compact, dateInput, diffOp, errorBox, field, fieldset, textArea, textInput } from "./kit.js";
import { nextOrder, run } from "./tools.js";
import { store } from "../store.js";

const freshAi = () => ({ text: "", busy: false, proposal: null, error: "" });
const ui = { addFor: null, tab: "ai", ai: freshAi(), draft: null, editId: null, titleFor: null, title: "" };

const FIELDS = ["label", "kind", "date", "checkIn", "checkOut", "time", "endTime", "address", "city", "region", "lat", "lng", "mapsUrl", "website", "phone", "note", "maybe"];
const planPlace = (id) => store.docs.plan?.places?.[id];
const scrollTo = (sel) => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);

function close(ctx) {
  ui.addFor = null;
  ui.editId = null;
  ui.draft = null;
  ui.ai = freshAi();
  ctx.rerender();
}

function newDraft(day, kind = "sight") {
  return { kind, label: "", date: day.date, checkIn: day.date, checkOut: addDays(day.date, 1), time: "", endTime: "", address: "", city: day.sleep?.city || "", region: day.regions.at(-1) || "", mapsUrl: "", website: "", phone: "", note: "", maybe: false };
}

// ---------------------------------------------------------------- the form (new or existing place)

function placeForm(ctx, day, original) {
  const d = ui.draft;
  const errors = errorBox();
  const hotelBox = h("div", {});
  const visitBox = h("div", {});
  const showKind = () => {
    hotelBox.style.display = d.kind === "hotel" ? "block" : "none";
    visitBox.style.display = d.kind === "hotel" ? "none" : "block";
  };
  const linkHint = h("p", { class: "meta" });
  const onLink = (v) => {
    d.mapsUrl = v.trim();
    const pos = coordsFromMapsUrl(d.mapsUrl);
    if (pos) {
      d.lat = pos.lat;
      d.lng = pos.lng;
      if (!d.label) d.label = nameFromMapsUrl(d.mapsUrl) || "";
      linkHint.replaceChildren(icon("check", "icon-sm"), " המיקום נקלט מהקישור.");
    } else {
      linkHint.replaceChildren(isShortMapsUrl(d.mapsUrl) ? "קישור מקוצר: את המיקום המדויק ה-AI יודע לקרוא (לשונית ״עם AI״). כאן נשמור רק את הקישור." : "");
    }
  };
  hotelBox.append(h("div", { class: "grid-2" },
    field("נכנסים ב-", dateInput(d.checkIn, (v) => { d.checkIn = v; })),
    field("יוצאים ב-", dateInput(d.checkOut, (v) => { d.checkOut = v; }))),
  field("צ׳ק-אין משעה (לא חובה)", h("input", { class: "input", type: "time", dir: "ltr", value: d.time || "", style: { maxWidth: "180px" }, oninput: (e) => { d.time = e.target.value; } })));
  visitBox.append(field("באיזה יום", dateInput(d.date, (v) => { d.date = v; })),
    h("div", { class: "grid-2" },
      field("משעה (לא חובה)", h("input", { class: "input", type: "time", dir: "ltr", value: d.time || "", oninput: (e) => { d.time = e.target.value; } })),
      field("עד שעה", h("input", { class: "input", type: "time", dir: "ltr", value: d.endTime || "", oninput: (e) => { d.endTime = e.target.value; } }))),
    fieldset("בטוח או אולי?", choices([{ value: false, label: "בטוח" }, { value: true, label: "אולי נעצור" }], !!d.maybe, (v) => { d.maybe = v; })));
  showKind();

  const onSave = async (btn) => {
    const next = compact({ ...d });
    if (next.kind === "hotel") { delete next.date; delete next.endTime; delete next.maybe; } else { delete next.checkIn; delete next.checkOut; }
    if (next.maybe === false) delete next.maybe;
    if (!next.label) return errors.show(["כתבו את שם המקום."]);
    const op = original
      ? diffOp("places", original.id, planPlace(original.id), next, FIELDS)
      : { t: "create", e: "places", id: newId(ID_PREFIX.places), v: { ...next, order: nextOrder(store.docs.plan?.places) } };
    if (!op) return close(ctx);
    btn.disabled = true;
    try {
      await run([op], { doneText: original ? "נשמר ✓" : `״${next.label}״ נוסף למסלול` });
      close(ctx);
    } catch (err) {
      btn.disabled = false;
      errors.show(err.errors?.length ? err.errors : [err.message]);
    }
  };

  return h("div", {},
    errors,
    fieldset("מה זה?", choices(PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_HE[k], icon: PLACE_KIND_ICON[k] })), d.kind, (v) => { d.kind = v; showKind(); }, { label: "סוג המקום" })),
    field("שם", textInput(d.label, (v) => { d.label = v; }, { placeholder: d.kind === "hotel" ? "למשל: Hampton Inn Richmond" : "למשל: Top of the Rock", maxlength: 80 })),
    hotelBox, visitBox,
    field("כתובת", textInput(d.address, (v) => { d.address = v; }, { dir: "auto", placeholder: "למשל: 700 E Main St, Richmond, VA", maxlength: 200 })),
    field("עיר", textInput(d.city, (v) => { d.city = v; }, { maxlength: 60 })),
    fieldset("מדינה בארה״ב", choices([{ value: "", label: "בלי" }, ...Object.entries(REGIONS).map(([code, r]) => ({ value: code, label: r.he }))], d.region || "", (v) => { d.region = v; }, { label: "מדינה" })),
    field("קישור מגוגל מפות (לא חובה)", textInput(d.mapsUrl, onLink, { dir: "ltr", inputmode: "url", placeholder: "https://maps.google.com/..." }), "מדביקים קישור ארוך — והמקום מופיע במפה."),
    linkHint,
    h("div", { class: "grid-2" },
      field("אתר (לא חובה)", textInput(d.website, (v) => { d.website = v.trim(); }, { dir: "ltr", inputmode: "url" })),
      field("טלפון (לא חובה)", textInput(d.phone, (v) => { d.phone = v; }, { dir: "ltr", inputmode: "tel", maxlength: 30 }))),
    field("הערה (רואה כל המשפחה)", textArea(d.note, (v) => { d.note = v; }, { rows: 2, maxlength: 300 })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: (e) => onSave(e.currentTarget) }, icon("check"), original ? "שמירה" : "הוספה"),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => close(ctx) }, "ביטול")));
}

// ---------------------------------------------------------------- with the AI

async function sendAi(ctx, day) {
  const ai = ui.ai;
  if (!ai.text.trim()) {
    ai.error = "כתבו, אמרו או הדביקו קודם מה להוסיף.";
    return ctx.rerender();
  }
  ai.busy = true;
  ai.error = "";
  ai.proposal = null;
  ctx.rerender();
  try {
    ai.proposal = await callFunction("aiPropose", { mode: "place", text: ai.text.trim(), date: day.date });
  } catch (err) {
    ai.error = err.message || "משהו השתבש. נסו שוב.";
  } finally {
    ai.busy = false;
    ctx.rerender();
  }
}

function aiBox(ctx, day) {
  const ai = ui.ai;
  if (store.demo) return notice("במצב הדגמה ה-AI לא מחובר. אחרי החיבור ל-Firebase זה יעבוד כאן.", "info", "info");
  const box = h("textarea", {
    class: "textarea", dir: "auto", rows: 3, disabled: ai.busy, "aria-label": "מה להוסיף ליום הזה",
    placeholder: day.sleep ? "למשל: Top of the Rock בעשר בבוקר" : "למשל: Hampton Inn Richmond, או קישור מגוגל מפות",
    oninput: (e) => { ai.text = e.target.value; },
  });
  box.value = ai.text;
  const examples = [
    day.sleep ? null : "מלון לשני לילות: Hampton Inn Richmond",
    "עצירה לארוחת צהריים בדרך, משהו טוב לילדים",
    "תוסיף את Top of the Rock בעשר בבוקר",
  ].filter(Boolean);
  return h("div", {},
    h("p", { class: "meta" }, "כתבו או אמרו שם של מלון או מקום, או הדביקו קישור מגוגל מפות. ה-AI ימצא כתובת, מיקום במפה ושעות, ויכין הצעה — שום דבר לא נשמר עד שתאשרו."),
    box,
    micHint(),
    h("div", { class: "choice-row", style: { marginTop: "8px" } }, examples.map((ex) =>
      h("button", { type: "button", class: "choice", style: { fontWeight: 500 }, onclick: () => { ai.text = ex; box.value = ex; box.focus(); } }, ex))),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", disabled: ai.busy, onclick: () => sendAi(ctx, day) }, icon("sparkles"), ai.busy ? "מחפש…" : "למצוא ולהציע"),
      micButton({ getText: () => ai.text, setText: (t) => { ai.text = t; box.value = t; }, disabled: ai.busy }),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => close(ctx) }, "ביטול")),
    ai.busy ? h("p", { class: "meta", role: "status" }, "מחפש את המקום… זה יכול לקחת עד דקה.") : null,
    ai.error ? notice(ai.error, "danger") : null,
    ai.proposal ? proposalCard(ai.proposal, { onDone: () => close(ctx) }) : null);
}

/** Under a day's places: the "+ הוספת מקום" button, or the open box. */
export function addPlaceArea(ctx, day) {
  if (ui.addFor !== day.date) {
    return h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: () => { ui.addFor = day.date; ui.editId = null; ui.tab = "ai"; ui.ai = freshAi(); ui.draft = newDraft(day); ctx.rerender(); scrollTo("#place-panel"); } }, icon("plus"), "הוספת מקום ליום הזה"),
      !day.sleep && !day.last
        ? h("button", { type: "button", class: "btn btn-secondary", onclick: () => { ui.addFor = day.date; ui.editId = null; ui.tab = "manual"; ui.ai = freshAi(); ui.draft = newDraft(day, "hotel"); ctx.rerender(); scrollTo("#place-panel"); } }, icon("hotel"), "מלון ללילה הזה")
        : null);
  }
  ui.draft ??= newDraft(day);
  return h("div", { class: "inline-form", id: "place-panel" },
    h("h3", {}, icon("plus"), " הוספה ליום הזה"),
    h("div", { class: "choice-row", role: "group", "aria-label": "איך להוסיף", style: { marginBottom: "12px" } },
      [["ai", "sparkles", "עם AI — שם, דיבור או קישור"], ["manual", "edit", "למלא בעצמי"]].map(([v, ic, label]) =>
        h("button", { type: "button", class: "choice", "aria-pressed": ui.tab === v ? "true" : "false", onclick: () => { ui.tab = v; ctx.rerender(); } }, icon(ic, "icon-sm"), label))),
    ui.tab === "ai" ? aiBox(ctx, day) : placeForm(ctx, day, null));
}

/** Edit / move / remove buttons in a place's row (or its edit form, when open). */
export function placeTools(ctx, p, day) {
  if (ui.editId === p.id) {
    return h("div", { class: "inline-form", id: "place-edit" }, h("h3", {}, icon("edit"), " עריכה"), placeForm(ctx, day, p));
  }
  const rec = planPlace(p.id);
  const sameDay = p.time || p.kind === "hotel" ? [] : activeList(store.docs.plan?.places).filter((x) => x.kind !== "hotel" && x.date === p.date && !x.time);
  const i = sameDay.findIndex((x) => x.id === p.id);
  return h("div", { class: "btn-row" },
    h("button", {
      type: "button", class: "edit-btn",
      onclick: () => { ui.editId = p.id; ui.addFor = null; ui.draft = { ...newDraft(day, p.kind), ...structuredClone(rec || p) }; ctx.rerender(); scrollTo("#place-edit"); },
    }, icon("edit", "icon-sm"), "עריכה"),
    sameDay.length > 1 ? [
      h("button", { type: "button", class: "edit-btn", disabled: i <= 0, onclick: () => run(moveIn(sameDay, i, -1)).catch(() => {}) }, icon("up", "icon-sm"), "למעלה"),
      h("button", { type: "button", class: "edit-btn", disabled: i >= sameDay.length - 1, onclick: () => run(moveIn(sameDay, i, 1)).catch(() => {}) }, icon("down", "icon-sm"), "למטה"),
    ] : null,
    h("button", { type: "button", class: "edit-btn", onclick: askFirst(p.label, () => run([{ t: "archive", e: "places", id: p.id }], { doneText: `״${p.label}״ הוסר מהמסלול` }).catch(() => {})) }, icon("trash", "icon-sm"), "הסרה"));
}

function moveIn(list, i, dir) {
  const a = list[i];
  const b = list[i + dir];
  const oa = a.order ?? i;
  const ob = b.order ?? i + dir;
  const [na, nb] = oa === ob ? [ob + dir, oa] : [ob, oa];
  return [
    { t: "update", e: "places", id: a.id, set: { order: na }, before: { order: a.order ?? null } },
    { t: "update", e: "places", id: b.id, set: { order: nb }, before: { order: b.order ?? null } },
  ];
}

/** Editors: give the day a title / note ("יום ביוניברסל"). */
export function dayTitleTools(ctx, day) {
  if (ui.titleFor !== day.date) {
    return h("div", { class: "btn-row", style: { marginTop: "0", marginBottom: "12px" } },
      h("button", { type: "button", class: "edit-btn", onclick: () => { ui.titleFor = day.date; ui.title = { title: day.title, note: day.note }; ctx.rerender(); } },
        icon("edit", "icon-sm"), day.title ? "עריכת הכותרת וההערה של היום" : "כותרת והערה ליום"));
  }
  const errors = errorBox();
  const id = day.dayId;
  const rec = store.docs.plan?.days?.[id];
  const save = async () => {
    const next = compact({ date: day.date, title: ui.title.title?.trim(), note: ui.title.note?.trim() });
    const op = rec ? diffOp("days", id, rec, next, ["title", "note"]) : { t: "create", e: "days", id: id || dayId(day.date), v: next };
    try {
      if (op) await run([op], { doneText: "נשמר ✓" });
      ui.titleFor = null;
      ctx.rerender();
    } catch (err) {
      errors.show(err.errors?.length ? err.errors : [err.message]);
    }
  };
  return h("div", { class: "inline-form" },
    errors,
    field("כותרת ליום", textInput(ui.title.title, (v) => { ui.title.title = v; }, { placeholder: "למשל: יום ביוניברסל", maxlength: 60 })),
    field("הערה ליום (רואה כל המשפחה)", textArea(ui.title.note, (v) => { ui.title.note = v; }, { rows: 2, maxlength: 300 })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: save }, icon("check"), "שמירה"),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { ui.titleFor = null; ctx.rerender(); } }, "ביטול")));
}
