// Signed-in data: family reads the private document once (Firestore Lite); editors get live updates of
// both documents (full Firestore), so several editors see each other's changes immediately.
import { TRIP_ID } from "../config.js";
import { firestoreFull, firestoreLite } from "../fb/lazy.js";

export async function readPrivateOnce() {
  const { m, db } = await firestoreLite();
  const snap = await m.getDoc(m.doc(db, "trips", TRIP_ID, "private", "state"));
  return snap.exists() ? snap.data() : null;
}

/** Live subscription for editors. onChange({pub}|{priv}). Returns an unsubscribe function. */
export async function watchDocs(onChange, onError) {
  const { m, db } = await firestoreFull();
  const unsubs = [
    m.onSnapshot(m.doc(db, "trips", TRIP_ID, "public", "state"), (s) => onChange({ pub: s.exists() ? s.data() : null }), onError),
    m.onSnapshot(m.doc(db, "trips", TRIP_ID, "private", "state"), (s) => onChange({ priv: s.exists() ? s.data() : null }), onError),
  ];
  return () => unsubs.forEach((u) => u());
}

/** The signed-in user's recent questions to the AI. */
export async function readMyAsks(uid, max = 5) {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "users", uid, "asks"), m.orderBy("at", "desc"), m.limit(max));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Uploaded tickets and confirmations (family+). Newest first. */
export async function listDocuments() {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "trips", TRIP_ID, "documents"), m.orderBy("uploadedAt", "desc"), m.limit(100));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Change history (family+). Newest first. */
export async function readChanges(max = 50) {
  const { m, db } = await firestoreLite();
  const q = m.query(m.collection(db, "trips", TRIP_ID, "changes"), m.orderBy("newVersion", "desc"), m.limit(max));
  const snap = await m.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
