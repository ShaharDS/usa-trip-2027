// Private documents in Firebase Storage. Files are read with getBlob() through the security rules — the app
// never creates public download links. Errors come back in Hebrew, saying what to do next.
import { storageModule } from "./lazy.js";
import { TRIP_ID } from "../config.js";

/** Firebase Storage error → a Hebrew sentence. `step` = "upload" | "open". */
export function storageErrorHe(err, step = "upload") {
  const code = String(err?.code || "").replace(/^storage\//, "");
  const status = Number(err?.status || err?.customData?.status || 0);
  if (code === "unauthenticated") return "צריך להתחבר שוב (כניסה למעלה) ולנסות שוב.";
  if (code === "unauthorized" || status === 403) {
    return step === "upload"
      ? "אחסון הקבצים סירב לקובץ: רק עורכים יכולים להעלות, PDF עד 20MB או תמונה (JPG / PNG / WEBP) עד 10MB."
      : "אין לחשבון הזה הרשאה לפתוח את הקובץ.";
  }
  if (code === "bucket-not-found" || code === "project-not-found" || code === "no-default-bucket" || status === 404) {
    return step === "upload"
      ? "אחסון הקבצים של האתר עוד לא הופעל. בעל האתר צריך להפעיל אותו פעם אחת ב-Firebase (Storage → Get started)."
      : "הקובץ לא נמצא באחסון.";
  }
  if (code === "object-not-found") return "הקובץ לא נמצא באחסון.";
  if (code === "quota-exceeded") return "נגמר מקום האחסון. כתבו לשחר.";
  if (code === "retry-limit-exceeded" || code === "canceled" || !navigator.onLine) return "אין חיבור כרגע. נסו שוב בעוד רגע.";
  return step === "upload"
    ? "העלאת הקובץ לא הצליחה. נסו שוב, ואם זה חוזר — כתבו לשחר."
    : "לא הצלחנו לפתוח את הקובץ. נסו שוב, ואם זה חוזר — כתבו לשחר.";
}

export async function uploadDoc(docId, fileName, blob, contentType) {
  const { m, storage } = await storageModule();
  const ref = m.ref(storage, `trips/${TRIP_ID}/docs/${docId}/${fileName}`);
  try {
    await m.uploadBytes(ref, blob, { contentType });
  } catch (err) {
    console.error("upload failed", err);
    throw new Error(storageErrorHe(err, "upload"));
  }
}

export async function docBlob(path) {
  const { m, storage } = await storageModule();
  try {
    return await m.getBlob(m.ref(storage, path));
  } catch (err) {
    console.error("open failed", err);
    throw new Error(storageErrorHe(err, "open"));
  }
}
