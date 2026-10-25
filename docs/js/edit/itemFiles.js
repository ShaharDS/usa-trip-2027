// Documents on a cost row (a flight's tickets, a hotel's confirmation): shown on the row, opened with the viewer,
// attached with "צירוף מסמך" (saved once in "מסמכים", linked from the private document — expenses carry prices, so
// only editors see these). Removing the link here keeps the file in "מסמכים".
import { h, icon } from "../ui/h.js";
import { askFirst } from "../components/common.js";
import { attachBox, freshBox } from "../components/attach.js";
import { fileButtons } from "../components/fileViewer.js";
import { docsIndex, fileOf } from "../data/docsIndex.js";
import { linkItemOps, unlinkItemOps } from "../shared/docLinks.js";
import { run } from "./tools.js";
import { can, store } from "../store.js";

const ui = { itemId: null, box: freshBox() };

export function openItemAttach(itemId) {
  ui.itemId = itemId;
  ui.box = freshBox();
}

/** The row's documents (+ the attach box when open). */
export function itemFiles(ctx, item) {
  if (!can.edit()) return null;
  const ids = store.docs.priv?.items?.[item.id]?.documentIds || [];
  const open = ui.itemId === item.id;
  if (!ids.length && !open) return null;
  const idx = ids.length ? docsIndex(ctx.rerender) : null;
  const files = idx ? ids.map((id) => idx.get(id)).filter(Boolean).map(fileOf) : [];
  const close = () => { ui.itemId = null; ui.box = freshBox(); ctx.rerender(); };
  return h("div", { class: "item-files" },
    ids.length
      ? [
        h("p", { class: "meta" }, icon("file", "icon-sm"), " מסמכים:"),
        idx ? fileButtons(files) : h("p", { class: "meta" }, "טוען…"),
        ctx.editMode && files.length
          ? h("div", { class: "btn-row", style: { marginTop: "4px" } }, files.map((f) =>
            h("button", {
              type: "button", class: "edit-btn",
              onclick: askFirst(f.title, () => run(unlinkItemOps(store.docs, item.id, f.id), { doneText: `״${f.title}״ נותק מ״${item.label}״` }).catch(() => {}), "הקובץ עצמו נשאר ב״מסמכים״."),
            }, icon("trash", "icon-sm"), `לנתק ״${f.title}״`)))
          : null,
      ]
      : null,
    open
      ? attachBox({
        box: ui.box, rerender: ctx.rerender, onClose: close,
        heading: `צירוף מסמך ל״${item.label}״`,
        hint: "למשל כרטיסי טיסה, אישור הזמנה או קבלה. רק עורכי הטיול רואים מסמכים של הוצאות.",
        onSaved: async (file) => {
          await run(linkItemOps(store.docs, item.id, file.id), { doneText: `״${file.title}״ צורף ל״${item.label}״` });
          close();
        },
      })
      : null);
}
