// Who am I (role for the UI) and the owner's people management. The allowlist lives in config/access; the
// owners (OWNER_EMAIL, comma-separated) are always kept on the editors list so the security rules let them read private data.
import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, paths, REGION } from "./lib/admin.js";
import { callerOf, forgetAccessCache, loadAccess, ownerEmails, requireRole } from "./lib/access.js";
import { badRequest } from "./lib/state.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function ensureOwnerListed(email: string, label: string) {
  if (!email) return;
  const access = await loadAccess(true);
  if (access.editors[email]) return;
  await db.doc(paths.access).set({ editors: { [email]: { label: label || "בעל האתר" } }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  forgetAccessCache();
}

export const whoami = onCall({ region: REGION }, async (req) => {
  const caller = await callerOf(req, true);
  if (caller.role === "owner") await ensureOwnerListed(caller.email || "", caller.label);
  return { role: caller.role, email: caller.email, label: caller.label };
});

export const getAccess = onCall({ region: REGION }, async (req) => {
  await requireRole(req, "owner");
  const access = await loadAccess(true);
  return { ...access, ownerEmails: ownerEmails() };
});

export const setAccess = onCall({ region: REGION }, async (req) => {
  const caller = await requireRole(req, "owner");
  const { add, remove, role, label } = (req.data || {}) as Record<string, unknown>;
  const owners = ownerEmails();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(paths.access);
    const snap = await tx.get(ref);
    const d = (snap.exists ? snap.data() : {}) as any;
    const editors: Record<string, any> = { ...(d.editors || {}) };
    const family: Record<string, any> = { ...(d.family || {}) };
    if (typeof add === "string") {
      const email = add.trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 120) badRequest("כתובת המייל לא תקינה.");
      const entry = { label: typeof label === "string" ? label.slice(0, 40) : "" };
      delete editors[email];
      delete family[email];
      if (role === "editors") editors[email] = entry;
      else family[email] = entry;
    }
    if (typeof remove === "string") {
      const email = remove.trim().toLowerCase();
      if (owners.includes(email)) badRequest("אי אפשר להסיר את בעל האתר.");
      delete editors[email];
      delete family[email];
    }
    for (const o of owners) editors[o] = editors[o] || { label: o === caller.email ? caller.label || "בעל האתר" : "בעל האתר" };
    if (Object.keys(editors).length > 25 || Object.keys(family).length > 60) badRequest("יותר מדי אנשים ברשימה.");
    tx.set(ref, { editors, family, alertEmails: d.alertEmails || [], updatedAt: FieldValue.serverTimestamp() });
  });
  forgetAccessCache();
  const access = await loadAccess(true);
  return { ...access, ownerEmails: owners };
});
