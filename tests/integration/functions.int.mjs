// End-to-end test of the Cloud Functions on the emulators (auth + firestore + functions).
//   npm run test:integration
// Uses fake Google accounts from the Auth emulator; OWNER_EMAIL=owner@example.com comes from functions/.env.local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROJECT = "demo-usa-trip";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FN = `http://127.0.0.1:5001/${PROJECT}/me-west1`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const seed = JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/data/seed-data.json", import.meta.url)), "utf8"));

async function googleUser(email, name) {
  const idToken = JSON.stringify({ sub: `sub-${email}`, email, email_verified: true, name });
  const res = await fetch(`${AUTH}/accounts:signInWithIdp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestUri: "http://localhost", postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`, returnSecureToken: true }),
  });
  const json = await res.json();
  assert.ok(json.idToken, `sign-in failed: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function call(name, data, token) {
  const res = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${name}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (json.error) {
    const err = new Error(json.error.message);
    err.status = json.error.status;
    err.details = json.error.details;
    throw err;
  }
  return json.result;
}

async function rejects(promise, status) {
  try {
    await promise;
  } catch (err) {
    assert.equal(err.status, status, `expected ${status}, got ${err.status}: ${err.message}`);
    return err;
  }
  assert.fail(`expected ${status}`);
}

async function readRest(path, token) {
  const res = await fetch(`${FS}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
}

test("full flow: owner → access → editor edits → viewer sees → undo", async () => {
  const owner = await googleUser("owner@example.com", "שחר");
  const editor = await googleUser("editor@example.com", "עורכת");
  const dad = await googleUser("dad@example.com", "אבא");
  const stranger = await googleUser("stranger@gmail.com", "זר");

  assert.equal((await call("whoami", {}, owner)).role, "owner");
  assert.equal((await call("whoami", {}, stranger)).role, "public");
  assert.equal((await call("whoami", {})).role, "public");

  // owner loads the opening data
  await rejects(call("adminImport", { pub: seed }, editor), "PERMISSION_DENIED");
  const imported = await call("adminImport", { pub: seed }, owner);
  assert.ok(imported.version >= 1);

  // anyone can read the public doc over REST; the private doc needs family
  const pub = await readRest("trips/usa2027/public/state");
  assert.equal(pub.status, 200);
  assert.equal((await readRest("trips/usa2027/private/state")).status, 403);

  // owner adds people
  await rejects(call("setAccess", { add: "x@y.com", role: "editors" }, editor), "PERMISSION_DENIED");
  await call("setAccess", { add: "editor@example.com", role: "editors", label: "עורכת" }, owner);
  const access = await call("setAccess", { add: "dad@example.com", role: "family", label: "אבא" }, owner);
  assert.ok(access.editors["owner@example.com"], "owner is always an editor");
  assert.ok(access.family["dad@example.com"]);
  await rejects(call("setAccess", { remove: "owner@example.com" }, owner), "INVALID_ARGUMENT");
  assert.equal((await call("whoami", {}, dad)).role, "family");
  assert.equal((await readRest("trips/usa2027/private/state", dad)).status, 200);

  // editor changes a price; family and strangers cannot
  const op = { t: "update", e: "items", id: "hotel_nyc", set: { "price.typical": 420 }, before: { "price.typical": 460 } };
  await rejects(call("commitChange", { ops: [op] }, dad), "PERMISSION_DENIED");
  await rejects(call("commitChange", { ops: [op] }, stranger), "PERMISSION_DENIED");
  await rejects(call("commitChange", { ops: [op] }), "UNAUTHENTICATED");
  const done = await call("commitChange", { ops: [op], summary: "client text is not trusted on the public doc" }, editor);
  assert.ok(done.changeId);

  const after = (await readRest("trips/usa2027/public/state")).json.fields;
  assert.equal(Number(after.items.mapValue.fields.hotel_nyc.mapValue.fields.price.mapValue.fields.typical.integerValue), 420);
  const recent0 = after.recent.arrayValue.values[0].mapValue.fields;
  assert.match(recent0.summary.stringValue, /מלון בניו יורק/);
  assert.equal(Number(recent0.deltaIlsTyp.integerValue), -2463);

  // same edit again: the "before" no longer matches -> conflict
  const conflict = await rejects(call("commitChange", { ops: [op] }, editor), "ABORTED");
  assert.match(conflict.message, /שינה בינתיים/);

  // invalid data is refused by the server even if a client skips its own checks
  await rejects(call("commitChange", { ops: [{ t: "update", e: "items", id: "food", set: { "price.typical": -1 } }] }, editor), "INVALID_ARGUMENT");
  await rejects(call("commitChange", { ops: [{ t: "update", e: "items", id: "food", set: { evil: "<script>" } }] }, editor), "INVALID_ARGUMENT");

  // undo restores the old price
  await call("undoChange", { changeId: done.changeId }, editor);
  const back = (await readRest("trips/usa2027/public/state")).json.fields;
  assert.equal(Number(back.items.mapValue.fields.hotel_nyc.mapValue.fields.price.mapValue.fields.typical.integerValue), 460);
  await rejects(call("undoChange", { changeId: done.changeId }, editor), "INVALID_ARGUMENT");

  // private details: editor can write, family can read, public never sees them
  await call("commitChange", { ops: [{ t: "create", e: "privateItems", id: "hotel_nyc", v: { bookingRef: "ABC123" } }] }, editor);
  const priv = await readRest("trips/usa2027/private/state", dad);
  assert.equal(priv.json.fields.items.mapValue.fields.hotel_nyc.mapValue.fields.bookingRef.stringValue, "ABC123");
  const pubText = JSON.stringify((await readRest("trips/usa2027/public/state")).json);
  assert.ok(!pubText.includes("ABC123"), "booking code must never reach the public document");
});

test("a second owner account (OWNER_EMAIL list) is a full owner and can't be removed", async () => {
  const owner = await googleUser("owner@example.com", "שחר");
  const owner2 = await googleUser("owner2@example.com", "שחר 2");
  assert.equal((await call("whoami", {}, owner2)).role, "owner");
  const acc = await call("getAccess", {}, owner2);
  assert.deepEqual(acc.ownerEmails, ["owner@example.com", "owner2@example.com"]);
  assert.ok(acc.editors["owner2@example.com"], "owner2 was put on the editors list by whoami");
  await call("setAccess", { add: "cousin@example.com", role: "family", label: "בת דודה" }, owner2);
  await rejects(call("setAccess", { remove: "owner2@example.com" }, owner), "INVALID_ARGUMENT");
  await rejects(call("setAccess", { remove: "owner@example.com" }, owner2), "INVALID_ARGUMENT");
  const r = await call("adminImport", { pub: seed }, owner2);
  assert.ok(r.version >= 1);
});
