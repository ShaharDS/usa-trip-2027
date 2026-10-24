// The only way the browser changes trip data. Demo mode: applied locally (lost on reload).
// Firebase mode: applied optimistically, then sent to the commitChange Cloud Function, which re-validates
// and writes; editors' live listener then delivers the authoritative documents.
import { store, setState } from "../store.js";
import { prepareCommit, prepareUndo } from "../shared/commit.js";
import { callFunction } from "../fb/api.js";

export class CommitError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

const localLog = []; // demo mode history (session only)
export const localHistory = () => localLog;

function byLabel() {
  return store.user?.name || store.user?.email?.split("@")[0] || (store.demo ? "מצב הדגמה" : "");
}

/** Commit ops. Resolves with {changeId}; throws CommitError with a Hebrew message. */
export async function commit(ops, { summary, source = "manual", proposalId } = {}) {
  const before = store.docs;
  const now = new Date().toISOString();
  const changeId = `local_${Date.now().toString(36)}`;
  const prepared = prepareCommit(before, ops, { now, byLabel: byLabel(), source, summary, changeId, byUid: store.user?.uid });
  if (!prepared.ok) throw new CommitError(prepared.errors[0], prepared.errors);
  setState({ docs: prepared.docs });

  if (store.demo) {
    localLog.unshift({ id: changeId, ...prepared.change });
    return { changeId };
  }
  try {
    return await callFunction("commitChange", { ops, summary: prepared.change.summary, baseVersion: before.pub.version || 0, proposalId: proposalId || null });
  } catch (err) {
    setState({ docs: before });
    throw new CommitError(err.message, err.details?.errors || []);
  }
}

export async function undo(changeId) {
  if (store.demo) {
    const change = localLog.find((c) => c.id === changeId);
    if (!change) throw new CommitError("לא מצאנו את השינוי.");
    const now = new Date().toISOString();
    const newId = `local_${Date.now().toString(36)}`;
    const prepared = prepareUndo(store.docs, change, { now, byLabel: byLabel(), changeId: newId, undoOf: changeId });
    if (!prepared.ok) throw new CommitError(prepared.errors[0], prepared.errors);
    change.undoneBy = newId;
    localLog.unshift({ id: newId, ...prepared.change });
    setState({ docs: prepared.docs });
    return { changeId: newId };
  }
  try {
    return await callFunction("undoChange", { changeId });
  } catch (err) {
    throw new CommitError(err.message, err.details?.errors || []);
  }
}
