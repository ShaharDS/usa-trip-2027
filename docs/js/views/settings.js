// Editor settings: trip basics, travelers, units, checklist, holidays, people & access, AI limits, backup.
// Tabs are big labelled buttons (no dropdowns). Every save is one undoable change.
import { h, icon, toast } from "../ui/h.js";
import { activeList, peopleCount } from "../shared/engine.js";
import { ID_PREFIX } from "../shared/ops.js";
import { newId } from "../shared/schema.js";
import { dateHe, fmtNum } from "../shared/format.js";
import { backLink, emptyState, notice, pageHead } from "../components/common.js";
import { choices, compact, dateInput, diffOp, errorBox, field, fieldset, numberInput, saveBar, textArea, textInput } from "../edit/kit.js";
import { nextOrder, run } from "../edit/tools.js";
import { can, setState, store } from "../store.js";
import { callFunction } from "../fb/api.js";

const TABS = [
  { id: "general", label: "כללי", icon: "settings" },
  { id: "people", label: "נוסעים", icon: "users" },
  { id: "units", label: "חדרים ורכבים", icon: "car" },
  { id: "todo", label: "משימות", icon: "list" },
  { id: "holidays", label: "חגים", icon: "calendar" },
  { id: "access", label: "גישה", icon: "lock" },
  { id: "ai", label: "AI", icon: "sparkles" },
  { id: "backup", label: "גיבוי", icon: "file" },
];
const clone = (x) => structuredClone(x);

async function saveOps(ops, errors, doneText) {
  const real = ops.filter(Boolean);
  if (!real.length) return toast("אין שינויים לשמור");
  try {
    await run(real, { doneText });
  } catch (err) {
    errors.show(err.errors?.length ? err.errors : [err.message]);
  }
}

function general(ctx) {
  const s = ctx.state.settings;
  const draft = clone(s);
  draft.fx ||= {};
  const errors = errorBox();
  const today = store.fxToday;
  const rateInput = numberInput(draft.fx.planningRate, (n) => { draft.fx.planningRate = n; draft.fx.planningRateDate = new Date().toISOString().slice(0, 10); });
  return [
    errors,
    h("section", { class: "card" },
      field("שם הטיול", textInput(draft.title, (v) => { draft.title = v; })),
      field("כותרת משנה", textInput(draft.subtitle, (v) => { draft.subtitle = v; })),
      h("div", { class: "grid-2" },
        field("יוצאים ב-", dateInput(draft.startDate, (v) => { draft.startDate = v; })),
        field("חוזרים ב-", dateInput(draft.endDate, (v) => { draft.endDate = v; })))),
    h("section", { class: "card" },
      field("שער הדולר לתכנון (₪ לדולר)", rateInput, `כל הסכומים בשקלים מחושבים לפי השער הזה, כדי שהסכום לא יקפוץ כל יום.${s.fx?.planningRateDate ? ` נקבע ב-${dateHe(s.fx.planningRateDate, "dmy")}.` : ""}`),
      today ? h("button", { type: "button", class: "btn btn-secondary", onclick: () => { rateInput.value = String(today.rate); draft.fx.planningRate = today.rate; draft.fx.planningRateDate = today.date; } }, icon("refresh"), `להשתמש בשער של היום (${fmtNum(today.rate, 2)})`) : null,
      h("div", { class: "grid-2", style: { marginTop: "12px" } },
        field("רזרבה (%)", numberInput(draft.bufferPct ?? 0, (n) => { draft.bufferPct = n ?? 0; }), "כרית ביטחון שמתווספת לסכום"),
        field("עמלת כרטיס אשראי (%)", numberInput(draft.cardFeePct ?? 0, (n) => { draft.cardFeePct = n ?? 0; }), "0 = לא מחשבים")),
      fieldset("״לאדם, בממוצע״ — לחלק לפי", choices(activeList(ctx.state.presets).map((p) => ({ value: p.id, label: `${p.label} (${peopleCount(ctx.state, p.id)})` })), draft.perPersonPreset || "", (v) => { draft.perPersonPreset = v; }))),
    h("section", { class: "card" },
      field("מה לא כלול בחישוב (שורה לכל דבר)", textArea((draft.notIncluded || []).join("\n"), (v) => { draft.notIncluded = v.split("\n").map((x) => x.trim()).filter(Boolean); })),
      field("טקסט ליצירת קשר (בתחתית העמוד)", textInput(draft.contactText, (v) => { draft.contactText = v; }))),
    saveBar(() => saveOps([diffOp("settings", "_", s, compact(draft), ["title", "subtitle", "startDate", "endDate", "fx", "bufferPct", "cardFeePct", "perPersonPreset", "notIncluded", "contactText"])], errors, "ההגדרות נשמרו"), { onCancel: () => history.back() }),
  ];
}

/** Generic list editor for small entities (label + a few fields), with add / archive. */
function listTab(ctx, entity, { title, fields, make, note }) {
  const map = ctx.state[entity] || {};
  const list = activeList(map);
  const drafts = Object.fromEntries(list.map((x) => [x.id, clone(map[x.id])]));
  const added = [];
  const errors = errorBox();
  const box = h("div", {});
  const row = (d, id, isNew) => h("div", { class: "card", style: { boxShadow: "none", border: "1px solid #DCE1E9" } },
    fields.map((f) => f.render(d)),
    isNew ? null : h("button", { type: "button", class: "btn btn-ghost", onclick: () => run([{ t: "archive", e: entity, id }], { doneText: "הוסר" }).catch(() => {}) }, icon("archive", "icon-sm"), "הסרה"));
  const draw = () => box.replaceChildren(
    ...list.map((x) => row(drafts[x.id], x.id, false)),
    ...added.map((a) => row(a.v, a.id, true)),
    h("button", { type: "button", class: "btn btn-secondary", onclick: () => { added.push({ id: newId(ID_PREFIX[entity]), v: make() }); draw(); } }, icon("plus"), "הוספה"));
  draw();
  const keys = [...new Set(fields.flatMap((f) => f.keys))];
  return [
    errors,
    h("section", { class: "card" }, h("h2", {}, title), note ? h("p", { class: "card-sub" }, note) : null, list.length || added.length ? null : emptyState("עוד אין כלום."), box),
    saveBar(() => saveOps([
      ...list.map((x) => diffOp(entity, x.id, map[x.id], compact(drafts[x.id]), keys)),
      ...added.map((a) => ({ t: "create", e: entity, id: a.id, v: { order: nextOrder(map), ...compact(a.v) } })),
    ], errors, "נשמר ✓"), { onCancel: () => history.back() }),
  ];
}

const F = {
  label: (placeholder = "") => ({ keys: ["label"], render: (d) => field("שם", textInput(d.label, (v) => { d.label = v; }, { placeholder })) }),
  count: (label) => ({ keys: ["count"], render: (d) => field(label, numberInput(d.count ?? 0, (n) => { d.count = Math.max(0, Math.round(n ?? 0)); }, { style: { maxWidth: "140px" } })) }),
};

function people(ctx) {
  const groups = activeList(ctx.state.groups);
  const groupsTab = listTab(ctx, "groups", {
    title: "קבוצות נוסעים",
    note: "כמה נוסעים בכל קבוצה. השינוי מעדכן מיד כל שורה שמחושבת לפי אנשים.",
    make: () => ({ label: "", count: 1 }),
    fields: [F.label("למשל: ילדים"), F.count("כמה")],
  });
  const presetsTab = listTab(ctx, "presets", {
    title: "״מי נספר״ בחישובים",
    note: "לכל אפשרות — מי מהקבוצות נספר. למשל ״כולם חוץ מהתינוקת״ לכרטיסים לפארקים.",
    make: () => ({ label: "", weights: Object.fromEntries(groups.map((g) => [g.id, 1])) }),
    fields: [F.label(), {
      keys: ["weights"],
      render: (d) => fieldset("נספרים", h("div", {}, groups.map((g) => h("div", { class: "row wrap", style: { margin: "4px 0" } },
        h("span", { style: { minWidth: "120px" } }, g.label),
        choices([{ value: 1, label: "כן" }, { value: 0, label: "לא" }], (d.weights ||= {})[g.id] ?? 0, (v) => { d.weights[g.id] = v; }))))),
    }],
  });
  return [...groupsTab, ...presetsTab];
}

const units = (ctx) => listTab(ctx, "units", {
  title: "חדרים, רכבים ויחידות",
  note: "שורות כמו ״מלון: 3 חדרים × לילות״ משתמשות במספרים האלה.",
  make: () => ({ label: "", count: 1 }),
  fields: [F.label("למשל: תאים בשייט"), F.count("כמה")],
});

const todo = (ctx) => listTab(ctx, "checklist", {
  title: "רשימת משימות",
  make: () => ({ label: "", done: false }),
  fields: [F.label("למשל: להוציא ESTA"),
    { keys: ["done"], render: (d) => fieldset("בוצע?", choices([{ value: false, label: "עוד לא" }, { value: true, label: "בוצע" }], !!d.done, (v) => { d.done = v; })) },
    { keys: ["dueDate"], render: (d) => field("עד תאריך (לא חובה)", dateInput(d.dueDate, (v) => { d.dueDate = v; })) }],
});

const holidays = (ctx) => listTab(ctx, "holidays", {
  title: "חגים ומועדים",
  note: "מוצגים על המסלול. הם לא משנים את החישוב.",
  make: () => ({ label: "", start: ctx.state.settings.startDate, end: ctx.state.settings.startDate, kind: "jewish" }),
  fields: [F.label(),
    { keys: ["start"], render: (d) => field("מתחיל", dateInput(d.start, (v) => { d.start = v; })) },
    { keys: ["end"], render: (d) => field("נגמר", dateInput(d.end, (v) => { d.end = v; })) }],
});

function access(ctx) {
  if (store.demo) return [notice("ניהול הגישה עובד אחרי חיבור ל-Firebase (ראו README). במצב הדגמה אין חשבונות.", "info", "info")];
  if (!can.owner()) return [notice("רק בעל האתר יכול לשנות מי נכנס.", "info", "lock")];
  const box = h("div", {}, h("p", { class: "meta" }, "טוען…"));
  const errors = errorBox();
  let data = { editors: {}, family: {} };
  const email = textInput("", () => {}, { dir: "ltr", inputmode: "email", placeholder: "name@gmail.com" });
  const name = textInput("", () => {}, { placeholder: "למשל: אבא" });
  let role = "family";
  const draw = () => box.replaceChildren(
    ...[["editors", "עורכים (יכולים לשנות)"], ["family", "משפחה (רואים מסמכים ושואלים את ה-AI)"]].map(([key, title]) =>
      h("div", { style: { marginBottom: "14px" } }, h("h3", {}, title),
        Object.keys(data[key] || {}).length
          ? h("ul", { class: "check-list" }, Object.entries(data[key]).map(([mail, info]) => h("li", {},
            h("span", { class: "grow" }, info?.label ? `${info.label} — ` : "", h("bdi", {}, mail)),
            (data.ownerEmails || []).includes(mail) ? h("span", { class: "meta" }, "בעל האתר") : h("button", { type: "button", class: "edit-btn", onclick: () => update({ remove: mail }) }, icon("trash", "icon-sm"), "הסרה"))))
          : emptyState("אין עדיין."))));
  const update = async (change) => {
    try {
      data = await callFunction("setAccess", change);
      draw();
      toast("הגישה עודכנה");
    } catch (err) {
      errors.show([err.message]);
    }
  };
  callFunction("getAccess", {}).then((d) => { data = d; draw(); }).catch((err) => errors.show([err.message]));
  return [
    errors,
    h("section", { class: "card" }, h("h2", {}, icon("users"), "מי נכנס לאתר"), h("p", { class: "card-sub" }, "את הסכום הכולל כולם רואים בלי כניסה. מסמכים ושאלות ל-AI — רק לחשבונות גוגל שברשימה."), box),
    h("section", { class: "card" },
      h("h2", {}, icon("plus"), "הוספת אדם"),
      field("כתובת Gmail", email),
      field("שם (לא חובה)", name),
      fieldset("הרשאה", choices([{ value: "family", label: "משפחה" }, { value: "editors", label: "עורך" }], role, (v) => { role = v; })),
      h("button", { type: "button", class: "btn", onclick: () => { const m = email.value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) return errors.show(["כתובת המייל לא תקינה"]); update({ add: m, role, label: name.value.trim() }); email.value = ""; name.value = ""; } }, icon("plus"), "הוספה")),
  ];
}

function ai(ctx) {
  if (!store.docs.priv) return [notice("הגדרות ה-AI זמינות אחרי כניסה.", "info", "lock")];
  const s = store.docs.priv.aiSettings || {};
  const draft = clone(s);
  const errors = errorBox();
  return [
    errors,
    h("section", { class: "card" },
      h("h2", {}, icon("sparkles"), "מגבלות שימוש ב-AI"),
      h("p", { class: "card-sub" }, "כל שאלה ל-AI עולה כמה סנטים ממפתח ה-API שלך. המגבלות שומרות שלא יצא יותר מדי."),
      field("תקציב חודשי ($)", numberInput(draft.monthlyBudgetUsd ?? 25, (n) => { draft.monthlyBudgetUsd = n ?? 0; })),
      h("div", { class: "grid-2" },
        field("שאלות ביום — משפחה", numberInput(draft.dailyCapFamily ?? 15, (n) => { draft.dailyCapFamily = Math.round(n ?? 0); })),
        field("פעולות ביום — עורכים", numberInput(draft.dailyCapEditor ?? 40, (n) => { draft.dailyCapEditor = Math.round(n ?? 0); }))),
      fieldset("לתת ל-AI לראות קודי הזמנה ופרטים פרטיים?", choices([{ value: false, label: "לא (מומלץ)" }, { value: true, label: "כן" }], !!draft.includePrivateInAsk, (v) => { draft.includePrivateInAsk = v; })),
      field("מודל", textInput(draft.model || "claude-opus-5-5", (v) => { draft.model = v.trim(); }, { dir: "ltr" }), "ברירת מחדל: claude-opus-5-5")),
    saveBar(() => saveOps([store.docs.priv.aiSettings ? diffOp("aiSettings", "_", s, compact(draft), ["monthlyBudgetUsd", "dailyCapFamily", "dailyCapEditor", "includePrivateInAsk", "model"]) : { t: "create", e: "aiSettings", id: "_", v: compact(draft) }], errors, "נשמר ✓"), { onCancel: () => history.back() }),
  ];
}

function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function backup(ctx) {
  const errors = errorBox();
  const stamp = new Date().toISOString().slice(0, 10);
  const importDocs = async (docs, label) => {
    if (store.demo) {
      setState({ docs: { pub: docs.pub, priv: docs.priv || store.docs.priv } });
      toast(`${label} — נטען (במצב הדגמה, לא נשמר)`);
      return;
    }
    try {
      await callFunction("adminImport", { pub: docs.pub, priv: docs.priv || null });
      toast(`${label} — נטען`);
    } catch (err) {
      errors.show(err.details?.errors || [err.message]);
    }
  };
  const fileInput = h("input", {
    type: "file", accept: "application/json,.json", class: "input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        await importDocs(json.pub ? json : { pub: json }, "הגיבוי");
      } catch {
        errors.show(["הקובץ לא נראה כמו גיבוי של האתר."]);
      }
    },
  });
  return [
    errors,
    h("section", { class: "card" },
      h("h2", {}, icon("file"), "גיבוי"),
      h("p", { class: "card-sub" }, "שומר קובץ עם כל נתוני הטיול (כולל פרטים פרטיים, אם נכנסתם)."),
      h("button", { type: "button", class: "btn", onclick: () => downloadJson({ pub: store.docs.pub, priv: store.docs.priv }, `usa-trip-backup-${stamp}.json`) }, icon("file"), "הורדת גיבוי")),
    can.owner() || store.demo
      ? h("section", { class: "card" },
        h("h2", {}, icon("upload"), "טעינת נתונים"),
        h("p", { class: "card-sub" }, "מחליף את כל נתוני הטיול. אפשר לבטל דרך ״היסטוריה״."),
        field("מקובץ גיבוי", fileInput),
        h("button", {
          type: "button", class: "btn btn-secondary",
          onclick: async () => { const seed = await fetch("data/seed-data.json", { cache: "no-cache" }).then((r) => r.json()); importDocs({ pub: seed }, "נתוני הפתיחה"); },
        }, icon("refresh"), "טען נתוני פתיחה"))
      : null,
  ];
}

const RENDER = { general, people, units, todo, holidays, access, ai, backup };

export function renderSettings(ctx, tab = "general") {
  if (!can.edit()) return [backLink(), pageHead("הגדרות"), notice("ההגדרות זמינות לעורכים בלבד.", "info", "lock")];
  const current = RENDER[tab] ? tab : "general";
  return [
    backLink(),
    pageHead("הגדרות"),
    h("nav", { class: "choice-row", "aria-label": "חלקי ההגדרות", style: { marginBottom: "16px" } },
      TABS.map((t) => h("a", { class: "choice", href: `#/settings/${t.id}`, "aria-current": t.id === current ? "page" : null, "aria-pressed": t.id === current ? "true" : "false", style: { textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" } }, icon(t.icon, "icon-sm"), t.label))),
    ...RENDER[current](ctx),
  ];
}
