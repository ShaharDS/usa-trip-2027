// Tickets and confirmations. The browser never touches Storage: it sends the file to addDocument (checked: editor,
// PDF / JPG / PNG / WEBP by its first bytes, size), which saves it with the admin SDK; getDocumentFile hands it back.
// So no Storage rules, cross-service IAM role or bucket CORS are involved.
//   - Editors' documents (they carry prices) are editors-only. A file attached to a place on the route
//     (`places.files` — a booking confirmation, a QR) may be opened by the family too, for as long as it is attached.
//   - deleteDocument removes every link to a file (one change in the history, like any edit), then the file.
//   - Reading with the AI: step 1 reads the file with NO tools (structured JSON; plain JSON if the structured
//     request is refused); those facts — never the raw document — feed step 2, the proposal (row booked, real
//     price, deadlines, private booking code, flight segments). An editor approves as usual. readDocument re-runs
//     this on a file already saved.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getStorage } from "firebase-admin/storage";
import { db, paths, REGION, TRIP_ID } from "./lib/admin.js";
import { requireRole, type Caller } from "./lib/access.js";
import { badRequest, readDocs, rejectPrepared, requireTripData, writeDocs } from "./lib/state.js";
import { prepareCommit } from "./shared/commit.js";
import { linkedToPlace, unlinkAllOps } from "./shared/docLinks.js";
import { aiSettingsOf, reserve, settle } from "./lib/caps.js";
import { ANTHROPIC_API_KEY, addUsage, createMessage, emptyUsage, textOf, toHttpsError, type Usage } from "./lib/claude.js";
import { EXTRACT_SYSTEM } from "./lib/prompts.js";
import { runProposal, saveProposal } from "./lib/propose.js";

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MB = 1024 * 1024;

/** What may be uploaded, how big, and how its first bytes must look (a renamed .exe is not a PDF). */
const TYPES: Record<string, { ext: string; max: number; magic: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: "pdf", max: 15 * MB, magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/jpeg": { ext: "jpg", max: 10 * MB, magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", max: 10 * MB, magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", max: 10 * MB, magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

/** "BoardingPass (3).pdf" -> "BoardingPass-3.pdf" */
function safeFileName(name: string, ext: string) {
  const base = String(name || "").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  return `${base}.${ext}`;
}

const nul = (type: string | string[]) => ({ type: Array.isArray(type) ? [...type, "null"] : [type, "null"] });

const FACT_KEYS = ["kind", "vendor", "summary", "confirmation", "currency", "totalPaid", "travelers", "startDate", "endDate", "freeCancelUntil", "finalPaymentDate", "segments", "notes"];
const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: FACT_KEYS,
  properties: {
    kind: { type: "string", enum: ["flight", "hotel", "car", "cruise", "parks", "insurance", "other"] },
    vendor: nul("string"),
    summary: { type: "string", description: "One short Hebrew line describing the booking" },
    confirmation: nul("string"),
    currency: { type: ["string", "null"], enum: ["USD", "ILS", "EUR", null] },
    totalPaid: nul("number"),
    travelers: nul("integer"),
    startDate: nul("string"),
    endDate: nul("string"),
    freeCancelUntil: nul("string"),
    finalPaymentDate: nul("string"),
    segments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["carrier", "number", "date", "from", "to", "depart", "arrive"],
        properties: { carrier: nul("string"), number: nul("string"), date: nul("string"), from: nul("string"), to: nul("string"), depart: nul("string"), arrive: nul("string") },
      },
    },
    notes: nul("string"),
  },
};

const UNREADABLE = /pdf|password|encrypt|could not process|unable to (read|process)|corrupt/i;
const unreadable = (reason: string) => {
  const messageHe = "ה-AI לא הצליח לפתוח את הקובץ (אולי ה-PDF נעול בסיסמה או פגום). נסו להעלות צילום מסך שלו.";
  return new HttpsError("invalid-argument", messageHe, { messageHe, reason: reason.slice(0, 300) });
};

/** The facts JSON from a reply — also when it came as plain text (code fences, a sentence around it). */
export function parseFacts(text: string): any {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in the reply");
  const raw = JSON.parse(s.slice(a, b + 1));
  const facts: any = {};
  for (const k of FACT_KEYS) facts[k] = raw[k] ?? null;
  facts.segments = Array.isArray(raw.segments) ? raw.segments.slice(0, 12) : [];
  facts.kind = ["flight", "hotel", "car", "cruise", "parks", "insurance", "other"].includes(facts.kind) ? facts.kind : "other";
  facts.summary = String(facts.summary || "מסמך").slice(0, 200);
  return facts;
}

/** Step 1: read the file (no tools). Structured output first; if that request is refused, plain JSON. */
async function readFacts(model: string, contentType: string, buf: Buffer, usage: Usage): Promise<any> {
  const data = buf.toString("base64");
  const block = contentType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: contentType, data } };
  const base = {
    model, max_tokens: 8000, thinking: { type: "adaptive" },
    messages: [{ role: "user", content: [block, { type: "text", text: "חלצו את פרטי ההזמנה מהמסמך." }] }],
  };
  try {
    const msg = await createMessage({ ...base, system: EXTRACT_SYSTEM, output_config: { effort: "medium", format: { type: "json_schema", schema: FACTS_SCHEMA } } } as any, { allowRetry: false });
    addUsage(usage, msg);
    return parseFacts(textOf(msg));
  } catch (err: any) {
    const reason = String(err?.details?.reason || err?.message || "");
    if (UNREADABLE.test(reason) && !/schema|format/i.test(reason)) throw unreadable(reason);
    if (err instanceof HttpsError && !["internal", "invalid-argument"].includes(err.code)) throw err; // rate limit, bad key, no connection
    logger.warn("structured extraction failed — retrying as plain JSON", { reason: reason.slice(0, 300) });
    try {
      const msg = await createMessage({
        ...base,
        system: `${EXTRACT_SYSTEM}\n\nAnswer with ONE JSON object only, no other text, with exactly these keys: ${FACT_KEYS.join(", ")}. segments = a list of {carrier, number, date, from, to, depart, arrive}.`,
        output_config: { effort: "medium" },
      } as any);
      addUsage(usage, msg);
      return parseFacts(textOf(msg));
    } catch (err2: any) {
      const reason2 = String(err2?.details?.reason || err2?.message || "");
      if (UNREADABLE.test(reason2)) throw unreadable(reason2);
      if (err2 instanceof HttpsError) throw err2;
      throw new HttpsError("internal", "לא הצלחנו לקרוא את המסמך.", { messageHe: "לא הצלחנו לקרוא את המסמך.", reason: reason2.slice(0, 300) });
    }
  }
}

/** Read a saved file with the AI and store a proposal. Keeps the facts even if the proposal step fails. */
async function readAndPropose(caller: Caller, docId: string, record: Record<string, any>, buf: Buffer) {
  const docRef = db.collection(paths.documents).doc(docId);
  const docs = await readDocs();
  requireTripData(docs);
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, "extract", 0.5, settings);
  const usage = emptyUsage();
  try {
    const facts = await readFacts(settings.model, String(record.contentType), buf, usage);
    await docRef.set({ facts, kind: facts.kind }, { merge: true });

    // Step 2: propose changes from the extracted facts (still treated as untrusted data).
    const userText = `הועלה מסמך "${record.title}" (מזהה ${docId}). אלה הפרטים שחולצו ממנו:\n<untrusted_document>\n${JSON.stringify(facts)}\n</untrusted_document>\nמצאו את שורת העלות המתאימה ועדכנו אותה: סטטוס (booked / paid), הסכום ששולם בפועל, מועדי ביטול/תשלום, קוד ההזמנה בפרטים הפרטיים, ורשמו טיסות אם יש. אם אין שורה מתאימה — הוסיפו אחת.`;
    let result;
    try {
      result = await runProposal(docs, "extraction", userText, settings.model);
    } catch (err: any) {
      const e = toHttpsError(err);
      const messageHe = `קראנו את המסמך (${facts.summary}), אבל ההצעה לעדכון לא הצליחה: ${e.message}`;
      throw new HttpsError(e.code, messageHe, { ...((e.details as object) || {}), messageHe });
    }
    usage.costUsd += result.usage.costUsd;
    // Link the document to the rows the proposal touches (private document list on each row).
    const touched = [...new Set(result.ops.filter((o: any) => o.e === "items").map((o: any) => o.id))];
    for (const itemId of touched) {
      const cur = result.working.priv?.items?.[itemId];
      const ids = [...new Set([...(cur?.documentIds || []), docId])];
      const op = cur
        ? { t: "update", e: "privateItems", id: itemId, set: { documentIds: ids }, before: { documentIds: cur.documentIds ?? null } }
        : { t: "create", e: "privateItems", id: itemId, v: { documentIds: ids } };
      result.ops.push(op);
      result.lines.push(`המסמך "${record.title}" צורף לשורה`);
      result.working = {
        plan: result.working.plan,
        priv: { ...result.working.priv, items: { ...(result.working.priv?.items || {}), [itemId]: { ...(cur || {}), documentIds: ids } } },
      };
    }
    result.usage.costUsd = usage.costUsd;
    const saved = await saveProposal(caller, "extraction", String(record.title), docs, result, { docId });
    await docRef.set({ proposalId: saved.proposalId }, { merge: true });
    return { docId, extracted: true, facts, ...saved };
  } catch (err) {
    const e = toHttpsError(err);
    throw new HttpsError(e.code, e.message, { ...((e.details as object) || {}), saved: true, docId });
  } finally {
    await settle(res, usage.costUsd);
  }
}

export const addDocument = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "1GiB" }, async (req) => {
  const caller = await requireRole(req, "editor");
  const contentType = String(req.data?.contentType || "");
  const type = TYPES[contentType];
  if (!type) badRequest("אפשר להעלות PDF או תמונה (JPG / PNG / WEBP).");
  const buf = Buffer.from(String(req.data?.data || ""), "base64");
  if (!buf.length) badRequest("הקובץ ריק. נסו לבחור אותו שוב.");
  if (buf.length > type.max) badRequest(`הקובץ גדול מדי (עד ${type.max / MB}MB).`);
  if (!type.magic(buf)) badRequest(contentType === "application/pdf" ? "הקובץ לא נראה כמו PDF תקין." : "הקובץ לא נראה כמו תמונה תקינה.");
  const fileName = safeFileName(String(req.data?.fileName || ""), type.ext);
  const title = String(req.data?.title || "").trim().slice(0, 80) || fileName;
  const shared = req.data?.share === "family";
  const placeId = shared && typeof req.data?.placeId === "string" && ID_RE.test(req.data.placeId) ? req.data.placeId : null;
  const extract = !shared && req.data?.extract !== false;

  const docRef = db.collection(paths.documents).doc();
  const docId = docRef.id;
  const file = getStorage().bucket().file(`trips/${TRIP_ID}/docs/${docId}/${fileName}`);
  await file.save(buf, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
  const record: Record<string, unknown> = {
    title, fileName, contentType, size: buf.length, uploadedBy: caller.label, uploadedAt: new Date().toISOString(), path: file.name,
    ...(shared ? { shared: true, placeId } : {}),
  };
  await docRef.set(record); // listed right away, even if reading it with the AI fails later
  if (!extract) return { docId, extracted: false, type: contentType === "application/pdf" ? "pdf" : "image" };
  return readAndPropose(caller, docId, record, buf);
});

/** Read a file that is already saved (e.g. the AI failed the first time). */
export const readDocument = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "1GiB" }, async (req) => {
  const caller = await requireRole(req, "editor");
  const docId = String(req.data?.docId || "");
  if (!ID_RE.test(docId)) badRequest("מסמך לא מוכר.");
  const snap = await db.collection(paths.documents).doc(docId).get();
  const record = snap.data();
  if (!snap.exists || !record || !String(record.path || "").startsWith(`trips/${TRIP_ID}/docs/${docId}/`)) {
    throw new HttpsError("not-found", "המסמך לא נמצא.", { messageHe: "המסמך לא נמצא." });
  }
  const [buf] = await getStorage().bucket().file(String(record.path)).download();
  return readAndPropose(caller, docId, record, buf);
});

/** A saved file to open: editors any, family only the ones shared on the route (base64; files are ≤ 15MB). */
export const getDocumentFile = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const caller = await requireRole(req, "family");
  const docId = String(req.data?.docId || "");
  if (!ID_RE.test(docId)) badRequest("מסמך לא מוכר.");
  const snap = await db.collection(paths.documents).doc(docId).get();
  const rec = snap.data();
  const path = String(rec?.path || "");
  if (!snap.exists || !path.startsWith(`trips/${TRIP_ID}/docs/${docId}/`)) {
    throw new HttpsError("not-found", "המסמך לא נמצא.", { messageHe: "המסמך לא נמצא." });
  }
  const editor = caller.role === "editor" || caller.role === "owner";
  if (!editor && !linkedToPlace((await readDocs()).plan, docId)) {
    throw new HttpsError("permission-denied", "המסמך הזה פתוח רק לעורכי הטיול.", { messageHe: "המסמך הזה פתוח רק לעורכי הטיול." });
  }
  const [buf] = await getStorage().bucket().file(path).download();
  return { contentType: String(rec?.contentType || "application/octet-stream"), fileName: String(rec?.fileName || "document"), data: buf.toString("base64") };
});

/** Delete a document: unlink it from every cost row and place (one change in the history), then the file. */
export const deleteDocument = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const caller = await requireRole(req, "editor");
  const docId = String(req.data?.docId || "");
  if (!ID_RE.test(docId)) badRequest("מסמך לא מוכר.");
  const docRef = db.collection(paths.documents).doc(docId);
  const snap = await docRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "המסמך כבר לא קיים.", { messageHe: "המסמך כבר לא קיים." });
  const rec = snap.data() || {};
  const changeRef = db.collection(paths.changes).doc();
  await db.runTransaction(async (tx) => {
    const docs = await readDocs(tx);
    const ops = unlinkAllOps(docs, docId);
    if (!ops.length) return;
    requireTripData(docs);
    const prepared = prepareCommit(docs, ops, {
      now: new Date().toISOString(), byUid: caller.uid, byLabel: caller.label, source: "manual",
      summary: `המסמך "${String(rec.title || "").slice(0, 80)}" נמחק ונותק מהמסלול ומההוצאות`, changeId: changeRef.id,
    });
    if (!prepared.ok) rejectPrepared(prepared);
    writeDocs(tx, prepared.docs);
    tx.set(changeRef, prepared.change);
  });
  const path = String(rec.path || "");
  if (path.startsWith(`trips/${TRIP_ID}/docs/${docId}/`)) {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  }
  await docRef.delete();
  return { ok: true, docId };
});
