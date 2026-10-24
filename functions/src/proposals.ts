// Approving or rejecting an AI proposal. Approval re-validates the chosen lines against the CURRENT trip
// (it may have changed since) and commits them as one change: source "ai", approved by the editor.
import { onCall } from "firebase-functions/v2/https";
import { db, paths, REGION } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { badRequest, readDocs, rejectPrepared, writeDocs } from "./lib/state.js";
import { prepareCommit } from "./shared/commit.js";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const applyProposal = onCall({ region: REGION }, async (req) => {
  const caller = await requireRole(req, "editor");
  const proposalId = String(req.data?.proposalId || "");
  if (!ID_RE.test(proposalId)) badRequest("לא מצאנו את ההצעה.");
  const accept: unknown = req.data?.accept;
  const ref = db.collection(paths.proposals).doc(proposalId);
  const changeRef = db.collection(paths.changes).doc();
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const docs = await readDocs(tx);
    if (!snap.exists) badRequest("לא מצאנו את ההצעה.");
    const p = snap.data() as any;
    if (p.status !== "open") badRequest(p.status === "applied" ? "ההצעה הזו כבר אושרה." : "ההצעה הזו כבר לא פתוחה.");
    const all: any[] = p.ops || [];
    const picked = Array.isArray(accept) ? [...new Set(accept.filter((i) => Number.isInteger(i) && i >= 0 && i < all.length))].sort((a, b) => a - b) : all.map((_, i) => i);
    if (!picked.length) badRequest("לא סומן אף שינוי.");
    const ops = picked.map((i) => all[i]);
    const prepared = prepareCommit(docs, ops, {
      now, byUid: caller.uid, byLabel: caller.label, source: "ai", approvedBy: caller.label, proposalId, changeId: changeRef.id,
      summary: `הצעת AI: ${p.summaryHe || ""}`.slice(0, 600),
    });
    if (!prepared.ok) {
      if (prepared.conflicts) {
        tx.update(ref, { status: "stale" });
        return { ok: false, stale: true, messageHe: "הטיול השתנה מאז שההצעה נוצרה. בקשו הצעה חדשה." };
      }
      rejectPrepared({ ...prepared, errors: prepared.errors.map((e: string) => (picked.length < all.length ? `${e} (אולי צריך לסמן גם שורה שהשינוי הזה תלוי בה)` : e)) });
    }
    writeDocs(tx, prepared.docs);
    tx.set(changeRef, prepared.change);
    tx.update(ref, { status: "applied", changeId: changeRef.id, appliedBy: caller.label, appliedAt: now, acceptedLines: picked });
    return { ok: true, changeId: changeRef.id, version: prepared.docs.pub.version };
  });
});

export const rejectProposal = onCall({ region: REGION }, async (req) => {
  const caller = await requireRole(req, "editor");
  const proposalId = String(req.data?.proposalId || "");
  if (!ID_RE.test(proposalId)) badRequest("לא מצאנו את ההצעה.");
  await db.collection(paths.proposals).doc(proposalId).update({ status: "rejected", rejectedBy: caller.label, rejectedAt: new Date().toISOString() });
  return { ok: true };
});
