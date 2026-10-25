// Files on a place (a booking confirmation, a QR ticket, a boarding pass) — opened right from the route. An image
// opens full-screen on white (bright and big enough to scan at a gate); a PDF opens in a new tab. Files come from
// the getDocumentFile function (family may open the ones attached to the route; editors any).
import { h, icon, toast } from "../ui/h.js";
import { callFunction } from "../fb/api.js";
import { store } from "../store.js";

async function fileUrl(id) {
  const r = await callFunction("getDocumentFile", { docId: id });
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
}

function imageViewer(file) {
  const img = h("img", { alt: file.title || "קובץ", class: "viewer-img" });
  const status = h("p", { class: "meta", role: "status" }, "טוען…");
  let url = null;
  const openNew = h("a", { class: "btn btn-secondary", target: "_blank", rel: "noopener", hidden: true }, icon("external", "icon-sm"), "פתיחה בחלון חדש");
  const dlg = h("dialog", { class: "viewer", "aria-label": file.title || "קובץ" },
    h("div", { class: "viewer-bar" },
      h("strong", { dir: "auto" }, file.title || "קובץ"),
      h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, icon("close", "icon-sm"), "סגירה")),
    h("div", { class: "viewer-body" }, status, img),
    h("div", { class: "viewer-foot" }, h("p", { class: "meta" }, icon("sun", "icon-sm"), " בכניסה: הגבירו את בהירות המסך."), openNew));
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
  document.body.append(dlg);
  dlg.showModal();
  fileUrl(file.id).then((u) => {
    url = u;
    img.src = u;
    openNew.href = u;
    openNew.hidden = false;
    status.remove();
  }).catch((err) => { status.textContent = err.message || "לא הצלחנו לפתוח את הקובץ."; });
}

export async function openFile(file) {
  if (store.demo) return toast("במצב הדגמה אין קבצים. אחרי ההתחברות זה נפתח כאן.");
  if (file.type === "image" && typeof HTMLDialogElement !== "undefined") return imageViewer(file);
  const win = window.open("", "_blank"); // opened during the tap (popup blockers), filled when the file arrives
  try {
    const url = await fileUrl(file.id);
    if (win) win.location.href = url;
    else location.href = url;
  } catch (err) {
    win?.close();
    toast(err.message || "לא הצלחנו לפתוח את הקובץ.");
  }
}

/** One button per file ("אישור הזמנה", "QR כניסה"). */
export function fileButtons(files) {
  if (!files?.length) return null;
  return h("div", { class: "file-row" }, files.map((f) =>
    h("button", { type: "button", class: "btn btn-secondary file-btn", onclick: () => openFile(f) },
      icon(f.type === "image" ? "ticket" : "file", "icon-sm"), h("span", { dir: "auto" }, f.title || (f.type === "image" ? "תמונה" : "מסמך")))));
}
