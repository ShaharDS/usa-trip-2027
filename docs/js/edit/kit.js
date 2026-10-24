// Form building blocks for the editor screens. Inputs update a draft object in place and call `onChange`;
// screens refresh only their preview nodes while typing (rebuilding the form would steal focus).
import { h, icon } from "../ui/h.js";

let uid = 0;
const nextId = () => `f${++uid}`;

export function field(label, control, hint) {
  const id = control.id || (control.id = nextId());
  return h("div", { class: "field" },
    h("label", { for: id }, h("span", {}, label, hint ? h("span", { class: "hint" }, hint) : null)),
    control);
}

/** Group of controls under one visible label (choices, rows). */
export function fieldset(label, content, hint) {
  return h("fieldset", { class: "field", style: { border: 0, padding: 0, margin: "0 0 14px" } },
    h("legend", { style: { padding: 0 } }, h("span", { style: { fontWeight: 700, fontSize: "16px", display: "block", marginBottom: "4px" } }, label,
      hint ? h("span", { class: "hint" }, hint) : null)),
    content);
}

export function textInput(value, onInput, attrs = {}) {
  return h("input", { class: "input", type: "text", value: value ?? "", dir: "auto", ...attrs, oninput: (e) => onInput(e.target.value) });
}

export function textArea(value, onInput, attrs = {}) {
  return h("textarea", { class: "textarea", dir: "auto", ...attrs, value: value ?? "", oninput: (e) => onInput(e.target.value) });
}

/** Number input (LTR, decimal keypad). Calls onInput(number|null). */
export function numberInput(value, onInput, attrs = {}) {
  return h("input", {
    class: "input", type: "text", inputmode: "decimal", dir: "ltr", autocomplete: "off",
    value: value === null || value === undefined ? "" : String(value),
    ...attrs,
    oninput: (e) => {
      const raw = e.target.value.replace(/,/g, "").trim();
      onInput(raw === "" ? null : Number(raw));
    },
  });
}

export function dateInput(value, onInput, attrs = {}) {
  return h("input", { class: "input", type: "date", dir: "ltr", value: value || "", ...attrs, oninput: (e) => onInput(e.target.value || null) });
}

export function select(options, value, onChange, attrs = {}) {
  return h("select", { class: "select", ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)));
}

/**
 * Big toggle buttons. Single choice: onChange(value). Multi: value is an array, onChange(array).
 * Rebuilding is local to this group, so focus elsewhere is not lost.
 */
export function choices(options, value, onChange, { multi = false, label = "" } = {}) {
  const wrap = h("div", { class: "choice-row", role: "group", "aria-label": label || null });
  const draw = () => {
    wrap.replaceChildren(...options.map((o) => {
      const on = multi ? (value || []).includes(o.value) : value === o.value;
      return h("button", {
        type: "button", class: "choice", "aria-pressed": on ? "true" : "false", title: o.title || null, "aria-label": o.ariaLabel || null,
        onclick: () => {
          if (multi) {
            const set = new Set(value || []);
            if (set.has(o.value)) set.delete(o.value);
            else set.add(o.value);
            value = options.map((x) => x.value).filter((v) => set.has(v));
          } else {
            value = o.value;
          }
          draw();
          onChange(value);
        },
      }, o.icon ? icon(o.icon, "icon-sm") : null, o.label);
    }));
  };
  draw();
  return wrap;
}

const PATH_HE = {
  label: "שם", title: "כותרת", "price.typical": "מחיר רגיל", "price.low": "מחיר נמוך", "price.high": "מחיר גבוה",
  categoryId: "קטגוריה", status: "סטטוס", nights: "לילות", kind: "סוג", icon: "אייקון", color: "צבע", anchorDate: "תאריך",
  url: "קישור", date: "תאריך", "fx.planningRate": "שער הדולר", count: "כמות", startDate: "תאריך יציאה", endDate: "תאריך חזרה",
  "actual.amount": "סכום בפועל", groupId: "שאלה", type: "סוג",
};

/** "items/item_x.price.typical: חסר ערך" -> "מחיר רגיל: חסר ערך" */
export function humanError(e) {
  const m = String(e).match(/^[A-Za-z]+(?:\/[^.:\s]+)?\.?([^:]*): (.*)$/);
  if (!m) return String(e);
  const path = m[1].replace(/\[\d+\]/g, "");
  const name = PATH_HE[path] || PATH_HE[path.split(".").pop()] || "";
  return name ? `${name}: ${m[2]}` : m[2];
}

export function errorBox() {
  const box = h("div", { role: "alert" });
  box.show = (errors) => {
    box.replaceChildren(...(errors?.length ? [h("div", { class: "notice notice-danger" }, icon("alert"), h("div", {}, h("strong", {}, "לא נשמר:"), h("ul", { style: { margin: "4px 0 0", paddingInlineStart: "18px" } }, [...new Set(errors.map(humanError))].slice(0, 6).map((e) => h("li", {}, e)))))] : []));
    if (errors?.length) box.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return box;
}

/** Remove empty strings / empty arrays / nulls from a record (keeps 0 and false). */
export function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact);
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    const c = compact(v);
    if (c && typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0 && k !== "rule") continue;
    out[k] = c;
  }
  return out;
}

/** Update op for the changed top-level fields of `fields` (with before values for conflict checks). */
export function diffOp(entity, id, original, next, fields) {
  const set = {};
  const before = {};
  for (const f of fields) {
    const a = original?.[f];
    const b = next?.[f];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      set[f] = b ?? null;
      before[f] = a ?? null;
    }
  }
  return Object.keys(set).length ? { t: "update", e: entity, id, set, before } : null;
}

export function saveBar(onSave, { onCancel, onRemove, saveLabel = "שמירה" } = {}) {
  const save = h("button", { type: "button", class: "btn" }, icon("check"), saveLabel);
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      await onSave();
    } finally {
      save.disabled = false;
    }
  });
  return h("div", { class: "btn-row" },
    save,
    h("button", { type: "button", class: "btn btn-secondary", onclick: onCancel || (() => history.back()) }, "ביטול"),
    onRemove ? h("button", { type: "button", class: "btn btn-danger", onclick: onRemove }, icon("archive"), "הסרה") : null);
}
