// The AI assistant: "Ask the trip" (family: route only, no prices; editors: everything) and change proposals
// from a sentence or a pasted quote (editors).
import { onCall } from "firebase-functions/v2/https";
import { db, REGION } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { readDocs, requireTripData } from "./lib/state.js";
import { aiSettingsOf, reserve, settle } from "./lib/caps.js";
import { ANTHROPIC_API_KEY, createWithPauses, textOf, toHttpsError, urlsOf } from "./lib/claude.js";
import { ASK_SYSTEM, FAMILY_ASK_SYSTEM, familyContext, referencePrices, tripContext } from "./lib/prompts.js";
import { requireText, runProposal, saveProposal } from "./lib/propose.js";
import { familyView } from "./shared/route.js";
import { tripDays } from "./shared/days.js";

// invoker "public": anyone may reach the endpoint; who may USE it is checked inside (requireRole). Stated
// explicitly so a redeploy always restores the binding (a half-failed first deploy can leave it missing).
const AI_OPTS = { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB" as const, invoker: "public" as const };

export const aiAsk = onCall(AI_OPTS, async (req) => {
  const caller = await requireRole(req, "family");
  const question = requireText(req.data?.question, 1000, "מה תרצו לשאול?");
  const docs = await readDocs();
  requireTripData(docs);
  const settings = aiSettingsOf(docs.priv);
  const seesPrices = caller.role === "editor" || caller.role === "owner";
  const res = await reserve(caller, "ask", 0.15, settings);
  let cost = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Family: the route only — no prices, no price research, no change history (it carries amounts).
    const system = seesPrices
      ? [
        { type: "text", text: `${ASK_SYSTEM}\n\n## General background research (not trip facts)\n${referencePrices()}`, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: tripContext(docs, {
            includePrivate: settings.includePrivateInAsk,
            history: (docs.plan.recent || []).map((e: any) => ({ at: e.at, by: e.byLabel, change: e.summary, totalChangeIls: e.deltaIlsTyp })),
          }),
          cache_control: { type: "ephemeral" },
        },
      ]
      : [
        { type: "text", text: FAMILY_ASK_SYSTEM },
        { type: "text", text: familyContext(docs), cache_control: { type: "ephemeral" } },
      ];
    const { msg, usage } = await createWithPauses({
      model: settings.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: `היום ${today}. השאלה: ${question}` }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
    } as any);
    cost = usage.costUsd;
    const refused = msg.stop_reason === "refusal";
    const answer = refused ? "לא אוכל לעזור בשאלה הזו. אפשר לשאול את שחר." : textOf(msg) || "לא מצאתי תשובה.";
    const { cited } = urlsOf(msg);
    const sources = [...cited.entries()].slice(0, 5).map(([url, title]) => ({ url, title: String(title).slice(0, 120) }));
    const ref = db.collection(`users/${caller.uid}/asks`).doc();
    await ref.set({ question, answer, sources, at: new Date().toISOString(), costUsd: Math.round(cost * 10000) / 10000, models: usage.models });
    return { askId: ref.id, answer, sources, cacheRead: usage.cacheRead };
  } catch (err) {
    throw toHttpsError(err);
  } finally {
    await settle(res, cost);
  }
});

/** The add box inside "לאן הולך הכסף": the editor typed or said an expense, maybe inside one category. */
function expenseRequest(docs: { plan: any }, text: string, categoryId: unknown): string {
  const cat = typeof categoryId === "string" ? docs.plan.categories?.[categoryId] : null;
  const where = cat && !cat.archived ? ` (נכתב בתוך הקטגוריה "${cat.label}", מזהה ${categoryId} — שימו שם אלא אם ברור שזה שייך לקטגוריה אחרת)` : "";
  return `העורך מוסיף הוצאה${where}. הוא כתב או אמר במילים חופשיות (אולי בהקלטה, עם טעויות):\n"${text}"\n` +
    "הוסיפו את ההוצאה כשורת עלות אחת (או כמה, אם הוזכרו כמה הוצאות). אם אין קטגוריה מתאימה — פתחו אחת. " +
    "מספר בלי מטבע = דולר, אלא אם נאמר שקל. \"לאדם\" / \"לכל אחד\" = לפי אנשים; \"ללילה\" = לפי לילות של העצירה המתאימה. " +
    "\"שילמנו\" = status paid עם actual_total; \"הזמנו\" = booked. אל תשנו שורות אחרות אלא אם ביקשו במפורש.";
}

/** "+ הוספת מקום" on a day: a hotel's name, a place, a Google Maps link — typed or spoken. */
function placeRequest(docs: { plan: any }, text: string, date: unknown): string {
  const route = familyView(docs.plan);
  const day = typeof date === "string" ? tripDays(route).find((d) => d.date === date) : null;
  const where = day
    ? `ביום ${day.n} של הטיול (${day.date})${day.stop ? `, כשהלינה ב${day.stop.label}` : ""}${day.sleep ? ` (הלילה: ${day.sleep.label})` : ""}`
    : "";
  return `העורך מוסיף למסלול${where ? ` ${where}` : ""}. הוא כתב או אמר (אולי בהקלטה, עם טעויות):\n<untrusted_document>\n${text}\n</untrusted_document>\n` +
    "מצאו את המקום ב-web_search: השם הרשמי, כתובת רחוב מלאה, עיר וקוד מדינה, אתר רשמי, ולמלון גם שעת צ׳ק-אין. " +
    `מלון: check_in = ${day ? day.date : "היום שצוין"} אלא אם נאמר אחרת, ו-check_out לפי מספר הלילות שנאמר (ברירת מחדל: לילה אחד). ` +
    "מקום אחר: date = היום הזה, ושעה אם נאמרה. אם הודבק קישור מגוגל מפות — העבירו אותו כמו שהוא ב-maps_url. " +
    "לאטרקציה מפורסמת תנו wikipedia_title (באנגלית). אל תמציאו כתובת: אם לא נמצאה, השאירו null. " +
    "אם ביקשו המלצה (\"עצירה לארוחת צהריים בדרך\") — חפשו והציעו מקום אחד או שניים עם maybe=true.";
}

export const aiPropose = onCall(AI_OPTS, async (req) => {
  const caller = await requireRole(req, "editor");
  const mode = (["quote", "expense", "place"] as const).find((m) => m === req.data?.mode) || "sentence";
  const text = requireText(req.data?.text, mode === "quote" ? 12000 : 1500, mode === "quote" ? "הדביקו את הצעת המחיר." : mode === "sentence" ? "מה לשנות?" : "מה להוסיף?");
  const docs = await readDocs();
  requireTripData(docs);
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, `propose-${mode}`, mode === "sentence" ? 0.8 : mode === "expense" ? 0.3 : 0.4, settings);
  let cost = 0;
  try {
    const note = typeof req.data?.note === "string" ? req.data.note.trim().slice(0, 500) : "";
    const userText = mode === "quote"
      ? `הודבקה הצעת מחיר / אישור הזמנה. עדכנו את שורות העלות המתאימות לפיה (מחיר, סטטוס "quote" או "booked", מועדים).${note ? `\nהערה מהעורך: ${note}` : ""}\n<untrusted_document>\n${text}\n</untrusted_document>`
      : mode === "expense"
        ? expenseRequest(docs, text, req.data?.categoryId)
        : mode === "place"
          ? placeRequest(docs, text, req.data?.date)
          : `בקשה מהעורך: ${text}`;
    const result = await runProposal(docs, mode, userText, settings.model);
    cost = result.usage.costUsd;
    return await saveProposal(caller, mode, text, docs, result);
  } catch (err) {
    throw toHttpsError(err);
  } finally {
    await settle(res, cost);
  }
});
