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
    await setDoc(doc(db, "trips/usa2027/public/state"), { version: 1, settings: { title: "x" } });
    await setDoc(doc(db, "trips/usa2027/private/state"), { items: { a: { bookingRef: "SECRET" } } });
    await setDoc(doc(db, "trips/usa2027/changes/c1"), { summary: "x" });
    await setDoc(doc(db, "trips/usa2027/proposals/p1"), { createdBy: { uid: "dad" } });
    await setDoc(doc(db, "trips/usa2027/proposals/p2"), { createdBy: { uid: "someone" } });
    await setDoc(doc(db, "trips/usa2027/usage/2027-01"), { costUsd: 1 });
  });
});
after(async () => env?.cleanup());

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid, email, verified) => env.authenticatedContext(uid, google(email, verified)).firestore();

test("anyone can read the public summary, nobody can write it", async () => {
  await assertSucceeds(getDoc(doc(anon(), "trips/usa2027/public/state")));
  await assertFails(setDoc(doc(anon(), "trips/usa2027/public/state"), { version: 99 }));
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/public/state"), { version: 99 }));
});

test("private data: family yes, strangers and anonymous no", async () => {
  await assertFails(getDoc(doc(anon(), "trips/usa2027/private/state")));
  await assertFails(getDoc(doc(as("x", "stranger@gmail.com"), "trips/usa2027/private/state")));
  await assertSucceeds(getDoc(doc(as("dad", "dad@example.com"), "trips/usa2027/private/state")));
  await assertSucceeds(getDoc(doc(as("dad", "DAD@example.com"), "trips/usa2027/private/state")), "email case doesn't matter");
  await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/private/state")));
  await assertFails(setDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/private/state"), {}));
});

test("an unverified email or a non-Google sign-in gets nothing", async () => {
  await assertFails(getDoc(doc(as("dad", "dad@example.com", false), "trips/usa2027/private/state")));
  const pw = env.authenticatedContext("dad2", { email: "dad@example.com", email_verified: true, firebase: { sign_in_provider: "password" } }).firestore();
  await assertFails(getDoc(doc(pw, "trips/usa2027/private/state")));
});

test("history and proposals", async () => {
  await assertSucceeds(getDoc(doc(as("dad", "dad@example.com"), "trips/usa2027/changes/c1")));
  await assertFails(getDoc(doc(anon(), "trips/usa2027/changes/c1")));
  await assertSucceeds(getDoc(doc(as("dad", "dad@example.com"), "trips/usa2027/proposals/p1")), "own proposal");
  await assertFails(getDoc(doc(as("dad", "dad@example.com"), "trips/usa2027/proposals/p2")), "someone else's");
  await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/proposals/p2")));
  await assertFails(getDoc(doc(as("dad", "dad@example.com"), "trips/usa2027/usage/2027-01")));
  await assertSucceeds(getDoc(doc(as("ed", "editor@example.com"), "trips/usa2027/usage/2027-01")));
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
