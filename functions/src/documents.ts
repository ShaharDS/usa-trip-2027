// Tickets and confirmations (editors only — they carry prices). The browser never touches Storage: it sends the
// file to addDocument (checked: editor, PDF / JPG / PNG / WEBP by its first bytes, size), which saves it with the
// admin SDK; getDocumentFile hands it back to an editor. So no Storage rules, cross-service IAM role or bucket
// CORS are involved. The file is read by Claude in a step WITHOUT tools (structured JSON only), and those facts —
// never the raw document — feed the proposal step, which suggests: mark the row booked, real price,
// deadlines, private booking code, flight segments. An editor approves as usual.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { db, paths, REGION, TRIP_ID } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { badRequest, readDocs, requireTripData } from "./lib/state.js";
import { aiSettingsOf, reserve, settle } from "./lib/caps.js";
import { ANTHROPIC_API_KEY, addUsage, createMessage, emptyUsage, textOf, toHttpsError } from "./lib/claude.js";
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

const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "vendor", "summary", "confirmation", "currency", "totalPaid", "travelers", "startDate", "endDate", "freeCancelUntil", "finalPaymentDate", "segments", "notes"],
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
  const extract = req.data?.extract !== false;

  const docRef = db.collection(paths.documents).doc();
  const docId = docRef.id;
  const file = getStorage().bucket().file(`trips/${TRIP_ID}/docs/${docId}/${fileName}`);
  await file.save(buf, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
  const record: Record<string, unknown> = {
    title, fileName, contentType, size: buf.length, uploadedBy: caller.label, uploadedAt: new Date().toISOString(), path: file.name,
  };
  if (!extract) {
    await docRef.set(record);
    return { docId, extracted: false };
  }

  const docs = await readDocs();
  requireTripData(docs);
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, "extract", 0.5, settings);
  const usage = emptyUsage();
  try {
    const data = buf.toString("base64");
    const block = contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: contentType, data } };
    // Step 1: read the file. No tools, structured output only.
    const msg = await createMessage({
      model: settings.model, max_tokens: 8000, thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: FACTS_SCHEMA } },
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: "חלצו את פרטי ההזמנה מהמסמך." }] }],
    } as any);
    addUsage(usage, msg);
    let facts: any;
    try {
      facts = JSON.parse(textOf(msg));
    } catch {
      throw new HttpsError("internal", "לא הצלחנו לקרוא את המסמך.", { messageHe: "לא הצלחנו לקרוא את המסמך." });
    }
    record.facts = facts;
    record.kind = facts.kind;

    // Step 2: propose changes from the extracted facts (still treated as untrusted data).
    const userText = `הועלה מסמך "${title}" (מזהה ${docId}). אלה הפרטים שחולצו ממנו:\n<untrusted_document>\n${JSON.stringify(facts)}\n</untrusted_document>\nמצאו את שורת העלות המתאימה ועדכנו אותה: סטטוס (booked / paid), הסכום ששולם בפועל, מועדי ביטול/תשלום, קוד ההזמנה בפרטים הפרטיים, ורשמו טיסות אם יש. אם אין שורה מתאימה — הוסיפו אחת.`;
    const result = await runProposal(docs, "extraction", userText, settings.model);
    result.usage.costUsd += usage.costUsd;
    // Link the document to the rows the proposal touches (private document list on each row).
    const touched = [...new Set(result.ops.filter((o: any) => o.e === "items").map((o: any) => o.id))];
    for (const itemId of touched) {
      const cur = result.working.priv?.items?.[itemId];
      const ids = [...new Set([...(cur?.documentIds || []), docId])];
      const op = cur
        ? { t: "update", e: "privateItems", id: itemId, set: { documentIds: ids }, before: { documentIds: cur.documentIds ?? null } }
        : { t: "create", e: "privateItems", id: itemId, v: { documentIds: ids } };
      result.ops.push(op);
      result.lines.push(`המסמך "${title}" צורף לשורה`);
      result.working = {
        plan: result.working.plan,
        priv: { ...result.working.priv, items: { ...(result.working.priv?.items || {}), [itemId]: { ...(cur || {}), documentIds: ids } } },
      };
    }
    const saved = await saveProposal(caller, "extraction", title, docs, result, { docId });
    record.proposalId = saved.proposalId;
    await docRef.set(record);
    return { docId, extracted: true, facts, ...saved };
  } catch (err) {
    await docRef.set(record, { merge: true }); // keep the file listed even if reading it failed
    const e = toHttpsError(err);
    throw new HttpsError(e.code, e.message, { ...((e.details as object) || {}), saved: true, docId });
  } finally {
    await settle(res, usage.costUsd);
  }
});

/** An uploaded file, for an editor to open (base64; files are at most 15MB). */
export const getDocumentFile = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  await requireRole(req, "editor");
  const docId = String(req.data?.docId || "");
  if (!ID_RE.test(docId)) badRequest("מסמך לא מוכר.");
  const snap = await db.collection(paths.documents).doc(docId).get();
  const rec = snap.data();
  const path = String(rec?.path || "");
  if (!snap.exists || !path.startsWith(`trips/${TRIP_ID}/docs/${docId}/`)) {
    throw new HttpsError("not-found", "המסמך לא נמצא.", { messageHe: "המסמך לא נמצא." });
  }
  const [buf] = await getStorage().bucket().file(path).download();
  return { contentType: String(rec?.contentType || "application/octet-stream"), fileName: String(rec?.fileName || "document"), data: buf.toString("base64") };
});
