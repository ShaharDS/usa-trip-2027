// Read the public trip document with one plain HTTPS request (no Firebase SDK for viewers).
import { ACTIVE_FIREBASE, EMULATOR_HOST, TRIP_ID, USE_EMULATORS } from "../config.js";

/** Firestore REST value -> plain JS. */
export function decodeValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function docUrl(path) {
  const { projectId, apiKey } = ACTIVE_FIREBASE;
  const base = USE_EMULATORS ? `http://${EMULATOR_HOST}:8080` : "https://firestore.googleapis.com";
  const url = `${base}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  return USE_EMULATORS ? url : `${url}?key=${encodeURIComponent(apiKey)}`;
}

/** @returns the decoded document, or null if it doesn't exist yet. */
export async function fetchDoc(path, token = null) {
  const res = await fetch(docUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  // 404 = no data yet; 403 = rules not deployed yet (a new database denies everything). Both: "not set up yet".
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const json = await res.json();
  return decodeFields(json.fields || {});
}

export const fetchPublicState = () => fetchDoc(`trips/${TRIP_ID}/public/state`);
