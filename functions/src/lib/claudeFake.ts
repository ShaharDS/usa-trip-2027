// Scripted stand-in for Claude, used only when CLAUDE_FAKE=1 (emulator tests) — no network, no cost.
// It looks at the request the way the real model would see it and answers with fixed tool calls / text,
// so the whole server path (tool loop, validation, proposals, caps, history) can be tested end to end.

let n = 0;
const id = (p: string) => `${p}_fake_${++n}`;
const usage = () => ({ input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } });

const NULL_ITEM = {
  label: null, category_id: null, note: null, people: null, people_count: null, unit_id: null, time_by: null, time_stop_ids: null,
  count: null, count_label: null, price_low: null, price_typical: null, price_high: null, currency: null, status: null, actual_total: null,
  option_id: null, sources: null,
};

function lastUserText(params: any): string {
  const first = params.messages[0];
  const content = typeof first.content === "string" ? first.content : (first.content || []).map((b: any) => b.text || "").join("\n");
  return content;
}

function message(content: any[], stop: string) {
  return { id: id("msg"), type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: stop, stop_details: null, usage: usage() } as any;
}

export function fakeMessage(params: any): any {
  const toolNames: string[] = (params.tools || []).map((t: any) => t.name).filter(Boolean);
  const hasToolResults = params.messages.some((m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === "tool_result"));
  const text = lastUserText(params);

  // Structured extraction (output_config.format): return a fixed booking.
  if (params.output_config?.format) {
    return message([{ type: "text", text: JSON.stringify({
      kind: "flight", vendor: "El Al", summary: "טיסות הלוך וחזור", confirmation: "ABC123", currency: "USD", totalPaid: 11900,
      travelers: 8, startDate: "2027-09-30", endDate: "2027-10-18", freeCancelUntil: null, finalPaymentDate: null,
      segments: [{ carrier: "LY", number: "1", date: "2027-09-30", from: "TLV", to: "JFK", depart: "00:45", arrive: "05:40" }],
      notes: "",
    }) }], "end_turn");
  }

  // No custom tools: a question ("Ask the trip").
  if (!toolNames.some((n) => n !== "web_search")) {
    return message([{ type: "text", text: "זו תשובת בדיקה: המלון בניו יורק מוערך בכ-25,800 ₪ (אומדן)." }], "end_turn");
  }

  if (hasToolResults) return message([{ type: "text", text: "הצעת בדיקה: הוספתי את מה שביקשת. אשרו כדי לשמור." }], "end_turn");

  const calls: Array<[string, any]> = [];
  if (/IGNORE|התעלם/i.test(text)) {
    // A hostile pasted quote: tries tools the quote mode doesn't offer + one legit update.
    calls.push(["update_settings", { title: "hacked", start_date: null, end_date: null, planning_rate: 1, buffer_pct: 0, card_fee_pct: null }]);
    calls.push(["remove_item", { item_id: "flights_intl" }]);
    calls.push(["update_item", { ...NULL_ITEM, item_id: "hotel_nyc", price_typical: 410, status: "quote" }]);
  } else if (toolNames.includes("set_booking_private")) {
    calls.push(["update_item", { ...NULL_ITEM, item_id: "flights_intl", status: "booked", actual_total: 11900, currency: "USD" }]);
    calls.push(["set_booking_private", { item_id: "flights_intl", booking_ref: "ABC123", confirmation: null, private_note: null }]);
    calls.push(["add_flight_segment", { item_id: "flights_intl", carrier: "LY", number: "1", date: "2027-09-30", from: "TLV", to: "JFK", sched_dep: "00:45", sched_arr: "05:40" }]);
  } else if (/quote|$d+/i.test(text) && !/וושינגטון/.test(text)) {
    calls.push(["update_item", { ...NULL_ITEM, item_id: "hotel_nyc", price_typical: 410, status: "quote" }]);
  } else if (/וושינגטון|washington/i.test(text)) {
    calls.push(["add_stop", { temp_id: "$dc", label: "וושינגטון", kind: "city", nights: 2, fill: null, anchor_date: null, after_stop_id: "nyc", icon: "landmark", note: null }]);
    calls.push(["add_item", { ...NULL_ITEM, temp_id: "$dc_hotel", label: "מלון בוושינגטון", category_id: "lodging", unit_id: "rooms", time_by: "nights", time_stop_ids: ["$dc"], price_low: 160, price_typical: 220, price_high: 350, currency: "USD", status: "estimate" }]);
    calls.push(["update_item", { ...NULL_ITEM, item_id: "ghost_row", label: "x" }]); // invalid on purpose: must come back as a tool error
  } else {
    calls.push(["add_item", { ...NULL_ITEM, temp_id: "$x", label: "שורת בדיקה", category_id: "extras", price_typical: 100, currency: "USD", status: "estimate" }]);
  }
  return message(calls.map(([name, input]) => ({ type: "tool_use", id: id("toolu"), name, input })), "tool_use");
}
