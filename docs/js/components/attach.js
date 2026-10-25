// "צירוף מסמך" — one box for attaching a file to a cost row or to a place on the route. The file is saved once in
// the documents list (addDocument), then `onSaved(file)` links it ({id, title, type}). What is chosen / typed lives
// in `box` (outside the render), so a background update doesn't lose it.
import { h, icon } from "../ui/h.js";
import { notice } from "./common.js";
import { callFunction } from "../fb/api.js";
import { blobToBase64, prepareUpload } from "../ui/resize.js";
import { refreshDocs } from "../data/docsIndex.js";
import { store } from "../store.js";

export const freshBox = () => ({ title: "", file: null, busy: false, error: "" });

/**
 * @param {{box: object, heading: string, hint: string, extra?: object, onSaved: (file) => Promise<void>, onClose: () => void, rerender: () => void}} o
 *   extra = more fields for addDocument (e.g. {share: "family", placeId}).
 */
export function attachBox(o) {
  const a = o.box;
  const chosen = h("p", { class: "meta", dir: "auto" }, a.file ? `נבחר: ${a.file.name}` : "");
  const title = h("input", { class: "input", type: "text", dir: "auto", value: a.title, maxlength: 80, placeholder: "למשל: כרטיסי טיסה / אישור הזמנה / QR כניסה", oninput: (e) => { a.title = e.target.value; } });
  const send = async () => {
    if (!a.file) { a.error = "בחרו קובץ קודם."; return o.rerender(); }
    if (store.demo) { a.error = "במצב הדגמה אין אחסון קבצים."; return o.rerender(); }
    a.busy = true;
    a.error = "";
    o.rerender();
    try {
      const { blob, contentType } = await prepareUpload(a.file);
      if (blob.size > (contentType === "application/pdf" ? 15 : 10) * 1024 * 1024) throw new Error("הקובץ גדול מדי (PDF עד 15MB, תמונה עד 10MB).");
      const name = (a.title || a.file.name.replace(/\.[^.]+$/, "")).trim().slice(0, 80);
      const r = await callFunction("addDocument", { extract: false, ...(o.extra || {}), contentType, fileName: a.file.name, title: name, data: await blobToBase64(blob) });
      refreshDocs();
      await o.onSaved({ id: r.docId, title: name, type: r.type || (contentType === "application/pdf" ? "pdf" : "image") });
    } catch (err) {
      a.busy = false;
      a.error = err.message || "הצירוף לא הצליח.";
      o.rerender();
    }
  };
  return h("div", { class: "inline-form" },
    h("h3", {}, icon("upload"), ` ${o.heading}`),
    h("p", { class: "meta" }, o.hint),
    h("div", { class: "field" }, h("label", {}, h("span", {}, "קובץ (PDF או תמונה)"),
      h("input", { type: "file", class: "input", accept: "application/pdf,image/*", disabled: a.busy, onchange: (e) => { a.file = e.target.files?.[0] || null; chosen.replaceChildren(a.file ? `נבחר: ${a.file.name}` : ""); } }))),
    chosen,
    h("div", { class: "field" }, h("label", {}, h("span", {}, "שם המסמך"), title)),
    a.error ? notice(a.error, "danger") : null,
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", disabled: a.busy, onclick: send }, icon("upload"), a.busy ? "מעלה…" : "צירוף"),
      h("button", { type: "button", class: "btn btn-secondary", disabled: a.busy, onclick: o.onClose }, "ביטול")),
    h("p", { class: "meta" }, icon("file", "icon-sm"), " המסמך נשמר גם ב״מסמכים״."));
}
