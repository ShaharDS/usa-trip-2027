// Storage security rules tests. Run with the emulator:  npm run test:rules
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const root = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
let env;
const google = (email) => ({ email, email_verified: true, firebase: { sign_in_provider: "google.com" } });
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // "%PDF-1.4"

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-usa-trip",
    firestore: { rules: root("firestore.rules"), host: "127.0.0.1", port: 8080 },
    storage: { rules: root("storage.rules"), host: "127.0.0.1", port: 9199 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "config/access"), { editors: { "editor@example.com": {} }, family: { "dad@example.com": {} } });
    await uploadBytes(ref(ctx.storage(), "trips/usa2027/docs/d1/ticket.pdf"), pdf, { contentType: "application/pdf" });
  });
});
after(async () => env?.cleanup());

const st = (uid, email) => (email ? env.authenticatedContext(uid, google(email)) : env.unauthenticatedContext()).storage();

test("tickets: editors can read; family, strangers and anonymous cannot (tickets show prices)", async () => {
  await assertSucceeds(getBytes(ref(st("ed", "editor@example.com"), "trips/usa2027/docs/d1/ticket.pdf")));
  await assertFails(getBytes(ref(st("dad", "dad@example.com"), "trips/usa2027/docs/d1/ticket.pdf")));
  await assertFails(getBytes(ref(st(), "trips/usa2027/docs/d1/ticket.pdf")));
  await assertFails(getBytes(ref(st("x", "stranger@gmail.com"), "trips/usa2027/docs/d1/ticket.pdf")));
});

test("only editors upload, only PDFs and images, never overwrite", async () => {
  await assertSucceeds(uploadBytes(ref(st("ed", "editor@example.com"), "trips/usa2027/docs/d2/hotel.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(st("dad", "dad@example.com"), "trips/usa2027/docs/d3/x.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(st("ed", "editor@example.com"), "trips/usa2027/docs/d4/x.html"), pdf, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(st("ed", "editor@example.com"), "trips/usa2027/docs/d2/hotel.pdf"), pdf, { contentType: "application/pdf" }), "no overwrite");
  await assertFails(uploadBytes(ref(st("ed", "editor@example.com"), "elsewhere/x.pdf"), pdf, { contentType: "application/pdf" }));
});
