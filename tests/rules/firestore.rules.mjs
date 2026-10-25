// Firestore security rules tests. Run with the emulator:  npm run test:rules
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const rules = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");
let env;

const google = (email, verified = true) => ({ email, email_verified: verified, firebase: { sign_in_provider: "google.com" } });

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-usa-trip", firestore: { rules, host: "127.0.0.1", port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "config/access"), { editors: { "editor@example.com": { label: "עורך" } }, family: { "dad@example.com": { label: "אבא" } } });
    await setDoc(doc(db, "trips/usa2027/public/state"), { version: 1, settings: { title: "x" }, itinerary: { stops: [] } });
    await setDoc(doc(db, "trips/usa2027/family/state"), { version: 1, places: { h: { label: "Hotel", address: "1 Main St" } } });
    await setDoc(doc(db, "trips/usa2027/plan/state"), { version: 1, items: { a: { price: { typical: 100, currency: "USD" } } } });
    await setDoc(doc(db, "trips/usa2027/private/state"), { items: { a: { bookingRef: "SECRET" } } });
    await setDoc(doc(db, "trips/usa2027/changes/c1"), { summary: "x" });
    await setDoc(doc(db, "trips/usa2027/documents/d1"), { title: "x" });
    await setDoc(doc(db, "trips/usa2027/proposals/p1"), { createdBy: { uid: "dad" } });
    await setDoc(doc(db, "trips/usa2027/proposals/p2"), { createdBy: { uid: "someone" } });
    await setDoc(doc(db, "trips/usa2027/usage/2027-01"), { costUsd: 1 });
  });
});
after(async () => env?.cleanup());

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid, email, verified) => env.authenticatedContext(uid, google(email, verified)).firestore();

test("anyone can read the public route, nobody can write it", async () => {
  await assertSucceeds(getDoc(doc(anon(), "trips/usa2027/public/state")));
  await assertFails(setDoc(doc(anon(), "trips/usa2027/public/state"), { version: 99 }));
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/public/state"), { version: 99 }));
});

test("the family route (hotel names, addresses): family and editors — not strangers or anonymous", async () => {
  const path = "trips/usa2027/family/state";
  await assertFails(getDoc(doc(anon(), path)), "anonymous");
  await assertFails(getDoc(doc(as("x", "stranger@gmail.com"), path)), "stranger");
  await assertFails(getDoc(doc(as("dad", "dad@example.com", false), path)), "unverified email");
  await assertSucceeds(getDoc(doc(as("dad", "dad@example.com"), path)), "family");
  await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), path)), "editor");
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), path), { version: 99 }), "no browser writes");
});

test("prices (the plan) and private data: editors only — not family, strangers or anonymous", async () => {
  for (const path of ["trips/usa2027/plan/state", "trips/usa2027/private/state"]) {
    await assertFails(getDoc(doc(anon(), path)), `anonymous: ${path}`);
    await assertFails(getDoc(doc(as("x", "stranger@gmail.com"), path)), `stranger: ${path}`);
    await assertFails(getDoc(doc(as("dad", "dad@example.com"), path)), `family: ${path}`);
    await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), path)), `editor: ${path}`);
    await assertSucceeds(getDoc(doc(as("ed", "EDITOR@example.com"), path)), "email case doesn't matter");
    await assertFails(setDoc(doc(as("ed", "editor@example.com"), path), {}), `no browser writes: ${path}`);
  }
});

test("an unverified email or a non-Google sign-in gets nothing", async () => {
  await assertFails(getDoc(doc(as("ed", "editor@example.com", false), "trips/usa2027/plan/state")));
  const pw = env.authenticatedContext("ed2", { email: "editor@example.com", email_verified: true, firebase: { sign_in_provider: "password" } }).firestore();
  await assertFails(getDoc(doc(pw, "trips/usa2027/plan/state")));
});

test("history, documents, proposals and usage: editors only (they carry prices)", async () => {
  for (const path of ["trips/usa2027/changes/c1", "trips/usa2027/documents/d1", "trips/usa2027/proposals/p1", "trips/usa2027/proposals/p2", "trips/usa2027/usage/2027-01"]) {
    await assertFails(getDoc(doc(anon(), path)), `anonymous: ${path}`);
    await assertFails(getDoc(doc(as("dad", "dad@example.com"), path)), `family: ${path}`);
    await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), path)), `editor: ${path}`);
  }
});

test("family may read their own AI answers only", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/dad/asks/a1"), { question: "?", answer: "!" });
  });
  await assertSucceeds(getDoc(doc(as("dad", "dad@example.com"), "users/dad/asks/a1")));
  await assertFails(getDoc(doc(as("ed", "editor@example.com"), "users/dad/asks/a1")));
  await assertFails(setDoc(doc(as("dad", "dad@example.com"), "users/dad/asks/a2"), { question: "x" }));
});

test("the access list is not readable or writable from the browser", async () => {
  await assertFails(getDoc(doc(as("ed", "editor@example.com"), "config/access")));
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), "config/access"), { editors: { "me@x.com": {} } }));
});

test("users may only store their own last-seen marker", async () => {
  const db = as("dad", "dad@example.com");
  await assertSucceeds(setDoc(doc(db, "users/dad"), { lastSeenVersion: 5, lastSeenAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "users/dad"), { lastSeenVersion: 5, lastSeenAt: serverTimestamp(), role: "owner" }));
  await assertFails(setDoc(doc(db, "users/other"), { lastSeenVersion: 5, lastSeenAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as("x", "stranger@gmail.com"), "users/x"), { lastSeenVersion: 1, lastSeenAt: serverTimestamp() }));
});

test("everything else is closed", async () => {
  await assertFails(getDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/backups/b1")));
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), "random/doc"), { a: 1 }));
});

test("old single-page site: overrides stay publicly readable and editor-writable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "overrides/flight.rt.A"), { v: 1000, by: "x", at: "2026-10-22" });
  });
  await assertSucceeds(getDoc(doc(anon(), "overrides/flight.rt.A")));
  const ed = as("ed", "editor@example.com");
  await assertSucceeds(setDoc(doc(ed, "overrides/flight.rt.B"), { v: 1200, by: "ed", at: "2026-10-25" }));
  await assertFails(setDoc(doc(ed, "overrides/flight.rt.C"), { v: 1200, by: "ed", at: "x", extra: 1 }));
  await assertFails(setDoc(doc(ed, "overrides/flight.rt.D"), { v: -5, by: "ed", at: "x" }));
  await assertFails(setDoc(doc(as("dad", "dad@example.com"), "overrides/flight.rt.E"), { v: 1, by: "dad", at: "x" }), "family can't edit");
  await assertFails(setDoc(doc(anon(), "overrides/flight.rt.F"), { v: 1, by: "x", at: "x" }));
});
