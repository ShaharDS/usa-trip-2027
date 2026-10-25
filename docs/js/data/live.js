// Signed-in data. Editors get live updates of the plan and the private document (full Firestore), so several
// editors see each other's changes immediately. Family gets live updates of the family route (hotels, addresses).
import { TRIP_ID } from "../config.js";
import { firestoreFull, firestoreLite } from "../fb/lazy.js";

/** Live subscription for editors. onChange({plan}|{priv}) — null when the document doesn't exist. */
export async function watchDocs(onChange, onError) {
  const { m, db } = await firestoreFull();
  const unsubs = [
    m.onSnapshot(m.doc(db, "trips", TRIP_ID, "plan", "state"), (s) => onChange({ plan: s.exists() ? s.data() : null }), onError),
    m.onSnapshot(m.doc(db, "trips", TRIP_ID, "private", "state"), (s) => onChange({ priv: s.exists() ? s.data() : null }), onError),
  ];
  return () => unsubs.forEach((u) => u());
}

/** Live family route (hotel names, addresses — no prices). onChange(doc | null). */
export async function watchFamily(onChange, onError) {
  const { m, db } = await firestoreFull();
  return m.onSnapshot(m.doc(db, "trips", TRIP_ID, "family", "state"), (s) => onChange(s.exists() ? s.data() : null), onError);
}

/** The signed-in user's recent questions to the AI. */
export async function readMyAsks(uid, max = 5) {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "users", uid, "asks"), m.orderBy("at", "desc"), m.limit(max));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Uploaded tickets and confirmations (editors). Newest first. */
export async function listDocuments() {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "trips", TRIP_ID, "documents"), m.orderBy("uploadedAt", "desc"), m.limit(100));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Change history (editors). Newest first. */
export async function readChanges(max = 50) {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "trips", TRIP_ID, "changes"), m.orderBy("newVersion", "desc"), m.limit(max));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
