# Runbook

## Deploy
- Site: push to `main` — GitHub Pages serves `docs/` (≈10 minutes cache).
- Backend: `firebase deploy` (rules + functions; the predeploy step copies `docs/js/shared` into `functions/` and builds).
- After changing `docs/js/shared/*`, deploy BOTH (the site and the functions use the same engine).

## Change the opening data
Edit `docs/data/seed-data.json`, run `npm test` (the golden totals test will tell you the new numbers — update it on purpose), then in the site: Settings → Backup → "טען נתוני פתיחה". The previous data is saved in `trips/usa2027/backups/{id}`.

## Backup / restore
Settings → Backup → "הורדת גיבוי" saves a JSON file. To restore, the owner loads it from the same screen.

## Add a person
Owner: Settings → גישה → email + role. Editors see prices and change data; family sees the route and can ask the AI (no prices). Anyone with the link sees the route.

## Icons
Add the Lucide name to `CONTENT` in `scripts/build-icons.mjs` and to `ICONS` in `schema.js`, then `node scripts/build-icons.mjs`.

## Troubleshooting
| Symptom | Check |
|---|---|
| "עוד אין נתוני טיול" / edits refused with "טען נתוני פתיחה" | `plan/state` doesn't exist yet: the owner signs in and taps "טען נתוני פתיחה" (shown on the home page, also Settings → גיבוי). |
| Sign-in does nothing in WhatsApp | In-app browsers block Google sign-in — open the link in Chrome/Safari (the page shows a button). |
| "החשבון הזה עוד לא ברשימת המשפחה" | Add the exact Gmail address in Settings → גישה. |
| AI: "מפתח ה-API… לא תקין" | `firebase.cmd functions:secrets:set ANTHROPIC_API_KEY` (a real key starts with `sk-ant-`), then redeploy the AI functions — they stay pinned to the secret version they were deployed with. The real Anthropic error (status/type) is in the function logs ("Claude API call failed"). |
| AI: "התקציב החודשי נגמר" | Settings → AI → monthly budget. |
| Functions runtime warnings | Runtime is Node 24 (`firebase.json`, `functions/package.json`); Node 20 was decommissioned on 30 Oct 2026. |
