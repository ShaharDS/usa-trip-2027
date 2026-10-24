// Who is calling: owner (OWNER_EMAIL — one or more accounts, comma-separated), editor or family (config/access),
// or nobody special.
// Mirrors the security rules: a verified Google account is required for any role.
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { db, paths } from "./admin.js";

export const OWNER_EMAIL = defineString("OWNER_EMAIL", { description: "Google account(s) of the site owner(s), comma-separated" });

export type Role = "public" | "family" | "editor" | "owner";
export interface Access {
  editors: Record<string, { label?: string }>;
  family: Record<string, { label?: string }>;
  alertEmails: string[];
}
export interface Caller {
  role: Role;
  uid: string | null;
  email: string | null;
  label: string;
}

const RANK: Record<Role, number> = { public: 0, family: 1, editor: 2, owner: 3 };
let cache: { at: number; access: Access } | null = null;

export const ownerEmails = (): string[] =>
  (OWNER_EMAIL.value() || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function loadAccess(fresh = false): Promise<Access> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.access;
  const snap = await db.doc(paths.access).get();
  const d = (snap.exists ? snap.data() : {}) as Partial<Access>;
  const access: Access = { editors: d.editors || {}, family: d.family || {}, alertEmails: d.alertEmails || [] };
  cache = { at: Date.now(), access };
  return access;
}

export function forgetAccessCache() {
  cache = null;
}

/** @param fresh skip the 60s cache (whoami: someone was just added and signs in right away). */
export async function callerOf(req: CallableRequest, fresh = false): Promise<Caller> {
  const token = req.auth?.token as Record<string, any> | undefined;
  const nobody: Caller = { role: "public", uid: req.auth?.uid || null, email: null, label: "" };
  if (!req.auth || !token?.email || token.email_verified !== true || token.firebase?.sign_in_provider !== "google.com") return nobody;
  const email = String(token.email).toLowerCase();
  const fallbackLabel = String(token.name || email.split("@")[0]);
  if (ownerEmails().includes(email)) return { role: "owner", uid: req.auth.uid, email, label: fallbackLabel };
  const access = await loadAccess(fresh);
  if (access.editors[email]) return { role: "editor", uid: req.auth.uid, email, label: access.editors[email].label || fallbackLabel };
  if (access.family[email]) return { role: "family", uid: req.auth.uid, email, label: access.family[email].label || fallbackLabel };
  return { ...nobody, email, label: fallbackLabel };
}

export async function requireRole(req: CallableRequest, min: Exclude<Role, "public">): Promise<Caller> {
  if (!req.auth) throw new HttpsError("unauthenticated", "צריך להתחבר קודם.", { messageHe: "צריך להתחבר קודם." });
  let caller = await callerOf(req);
  // Someone added a moment ago may hit a cached list: re-check once before refusing.
  if (RANK[caller.role] < RANK[min] && caller.email) caller = await callerOf(req, true);
  if (RANK[caller.role] < RANK[min]) {
    const msg = min === "owner" ? "רק בעל האתר יכול לעשות את זה." : min === "editor" ? "רק עורכים יכולים לשנות." : "החשבון הזה עוד לא ברשימת המשפחה.";
    throw new HttpsError("permission-denied", msg, { messageHe: msg });
  }
  return caller;
}
