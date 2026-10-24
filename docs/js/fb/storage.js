// Private documents in Firebase Storage. Files are read with getBlob() through the security rules — the app
// never creates public download links.
import { storageModule } from "./lazy.js";
import { TRIP_ID } from "../config.js";

export async function uploadDoc(docId, fileName, blob, contentType) {
  const { m, storage } = await storageModule();
  const ref = m.ref(storage, `trips/${TRIP_ID}/docs/${docId}/${fileName}`);
  await m.uploadBytes(ref, blob, { contentType });
}

export async function docBlob(path) {
  const { m, storage } = await storageModule();
  return m.getBlob(m.ref(storage, path));
}
