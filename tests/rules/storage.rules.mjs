// Storage security rules tests. Run with the emulator:  npm run test:rules
// The browser never touches Storage (files go through the addDocument / getDocumentFile functions), so the rules
// deny everyone — editors included.
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const root = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
let env;
const google = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: "google.com" } });
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // "%PDF-1.4"

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-usa-trip", storage: { rules: root("storage.rules"), host: "127.0.0.1", port: 9199 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "trips/usa2027/docs/d1/ticket.pdf"), pdf, { contentType: "application/pdf" });
  });
});
after(async () => env?.cleanup());

const st = (uid, email) => (email ? env.authenticatedContext(uid, google(email)) : env.unauthenticatedContext()).storage();

test("nobody reads tickets straight from Storage — not even editors (the function does, after checking)", async () => {
  for (const who of [st("ed", "editor@example.com"), st("dad", "dad@example.com"), st()]) {
    await assertFails(getBytes(ref(who, "trips/usa2027/docs/d1/ticket.pdf")));
  }
});

test("nobody writes to Storage from the browser", async () => {
  await assertFails(uploadBytes(ref(st("ed", "editor@example.com"), "trips/usa2027/docs/d2/hotel.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(st(), "elsewhere/x.pdf"), pdf, { contentType: "application/pdf" }));
});
