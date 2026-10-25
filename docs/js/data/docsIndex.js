// The documents list for editors (title, type, size…), loaded once and shared by the expense rows and the documents
// page, so a file attached anywhere shows its name everywhere. Reloaded after an upload or a delete.
import { listDocuments } from "./live.js";
import { store } from "../store.js";

let cache = null;
let loading = null;
const waiting = new Set();

/** Map docId → document, or null while it loads (`rerender` is called once it arrives). */
export function docsIndex(rerender) {
  if (cache) return cache;
  if (rerender) waiting.add(rerender);
  if (!loading) {
    loading = (store.demo ? Promise.resolve([]) : listDocuments())
      .then((list) => { cache = new Map(list.map((d) => [d.id, d])); })
      .catch(() => { cache = new Map(); })
      .finally(() => {
        loading = null;
        const fns = [...waiting];
        waiting.clear();
        fns.forEach((fn) => fn());
      });
  }
  return null;
}

/** Forget the list (after an upload / delete): the next screen loads it again. */
export function refreshDocs() {
  cache = null;
}

/** {id, title, type: "image" | "pdf"} for a file button. */
export const fileOf = (d) => ({ id: d.id, title: d.title, type: String(d.contentType || "").startsWith("image/") ? "image" : "pdf" });
