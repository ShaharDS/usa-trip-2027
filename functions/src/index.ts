// Cloud Functions (Blaze plan), all in me-west1 (Tel Aviv). Every one re-checks the caller's role.
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "me-west1", maxInstances: 5 });

export { commitChange, undoChange } from "./commitChange.js"; // the only write path for trip data
export { whoami, getAccess, setAccess } from "./accessAdmin.js"; // roles and the owner's people list
export { adminImport } from "./adminImport.js"; // owner: load opening data / a backup
export { aiAsk, aiPropose } from "./ai.js"; // Claude: answer questions (family) / propose changes (editors)
export { applyProposal, rejectProposal } from "./proposals.js"; // editors approve AI proposals line by line
export { addDocument } from "./documents.js"; // tickets & confirmations: register + read with Claude
