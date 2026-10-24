# הטיול המשפחתי לארה״ב — אתר עלויות ותכנון

אתר אחד שעונה על השאלה "כמה כל הטיול עולה, ומה כבר סגור?" — לכל המשפחה, בעברית, בטלפון.

- **כולם (בלי כניסה):** רק המסלול — ערים, תאריכים, לילות וחגים. בלי מחירים ובלי AI.
- **משפחה (כניסה אחת עם גוגל, כפתור "כניסה" בראש כל עמוד):** גם שאלות ל-AI על המסלול ("מתי מגיעים לאורלנדו?"). עדיין בלי מחירים — גם ה-AI לא מקבל אותם.
- **עורכים:** הכול — הסכום, לאן הולך הכסף, מה סגור, אפשרויות, מסמכים, היסטוריה, ושינויים ידנית או במשפט ל-AI ("תוסיף עיר וושינגטון ל-2 לילות"). ה-AI רק מציע; עורך מאשר.

**הכול נתונים:** ערים ועצירות, קטגוריות, שורות, מחירים, מספר נוסעים, חדרים ורכבים, אפשרויות (למשל השייט), ואפילו סדר החלקים בעמוד הבית — הכול נערך מתוך האתר, בלי לגעת בקוד.

## איך זה עובד
```mermaid
flowchart LR
  V[דפדפן: כולם/משפחה] -- קריאה ישירה --> P[(Firestore: מסלול ציבורי, בלי מחירים)]
  F[דפדפן: משפחה/עורך] -- כניסה עם גוגל --> A[Firebase Auth]
  F -- כל שינוי --> CF[Cloud Functions<br/>me-west1]
  CF -- בודק, מחשב, שומר היסטוריה --> PL[(תוכנית עם מחירים — עורכים)]
  CF -- מפיק מחדש מהתוכנית --> P
  CF --> Q[(מסמך פרטי — עורכים)]
  CF -- שאלות/הצעות --> C[Claude API<br/>המפתח רק בשרת]
  F -- כרטיסים --> S[(Storage פרטי)]
```
- האתר עצמו סטטי (GitHub Pages, בלי build): `docs/`.
- כל שינוי עובר דרך פונקציה אחת (`commitChange`) שבודקת אותו שוב, מחשבת את הסכומים ושומרת היסטוריה — אפשר לבטל כל שינוי.
- מנוע החישוב (`docs/js/shared/`) משותף לדפדפן ולשרת, כך שהמספרים תמיד זהים.

## עלות
- GitHub Pages: חינם. Firebase (תוכנית Blaze): כמעט תמיד בתוך המכסה החינמית למשפחה.
- Claude (מודל Sonnet 5.5): בערך 1–5 סנט לשאלה, 5–15 סנט להצעה עם חיפוש מחירים. שימוש רגיל ≈ $6 בחודש. יש תקרה חודשית (ברירת מחדל $25) ומגבלה יומית לכל אדם — בהגדרות → AI.

## הקמה (פעם אחת — שחר עושה בעצמו)
1. **Firebase:** בחשבון הגוגל של בעל האתר צרו פרויקט (אצלנו: `usa-trip-2027-shahar`), עברו ל-Blaze והגדירו התראת תקציב.
2. **Firestore:** צרו מסד ב-`me-west1` (Tel Aviv), מצב production.
3. **Storage:** צרו bucket ב-`us-central1` (שם יש מכסה חינמית) ואשרו את ההרשאה ש-Firebase מבקש עבור כללים שקוראים מ-Firestore.
4. **Authentication:** הפעילו Google. ב-Settings → Authorized domains הוסיפו `shahards.github.io`.
5. **אפליקציית Web:** Project settings → Your apps → Web app. העתיקו את ה-config לקובץ `docs/js/config.js` (במקום `FIREBASE_CONFIG = null`). זה לא סוד.
6. **בעל האתר:** העתיקו את `functions/.env.example` ל-`functions/.env` ושימו בו `OWNER_EMAIL=` עם כתובת הגוגל של בעל האתר (הקובץ לא נכנס ל-git).
7. **מפתח Claude** (רק אתם מקלידים אותו):
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   ובקונסולת Anthropic הגדירו גם מגבלת הוצאה ל-workspace של המפתח.
8. **פריסה:**
   ```bash
   firebase use --add
   ```
   ```bash
   firebase deploy
   ```
   ```bash
   firebase functions:artifacts:setpolicy
   ```
9. **GitHub:** צרו repo ציבורי `usa-trip-2027`, דחפו, ו-Settings → Pages → Branch `main` / folder `/docs`.
10. **באתר:** לחצו "כניסה" למעלה → **"טען נתוני פתיחה"** (מופיע בעמוד הבית כל עוד אין נתונים; גם בהגדרות → גיבוי) → הגדרות → גישה: הוסיפו את המשפחה ("משפחה" = מסלול ו-AI בלי מחירים) ועורכים ("עורך" = רואים מחירים ומשנים).

## שימוש יומיומי
- **לשנות מחיר:** "מצב עריכה" → קטגוריה → "עריכה" על השורה. כל חישוב מתעדכן מיד. "ביטול" בהודעה הקופצת או בהיסטוריה מבטל.
- **להוסיף עיר:** מסלול → "הוספת עיר או עצירה". הלילות יורדים מהעצירה ש"משלימה לילות" (אורלנדו), ואפשר להוסיף שורת מלון בלחיצה.
- **עם AI:** "שאלו" → "לשנות במשפט" / "הדבקת הצעת מחיר" → מקבלים רשימת שינויים → מסמנים → מאשרים.
- **כרטיס/אישור:** מסמכים → העלאה. ה-AI קורא ומציע: "הוזמן", מחיר בפועל, מועדי ביטול, קוד הזמנה (נשמר רק בחלק הפרטי).
- **WhatsApp:** כפתור "שיתוף בוואטסאפ" בראש העמוד. התצוגה המקדימה קבועה (לא מציגה את הסכום, כי וואטסאפ שומר אותה שבועות).

## בדיקות
```bash
npm test
```
```bash
npm run test:all
```
`npm test` — מנוע החישוב, האימות וכלי ה-AI (בלי רשת). `test:all` — גם כללי האבטחה ובדיקות קצה-לקצה מול אמולטורים של Firebase, עם "Claude מזויף" (`CLAUDE_FAKE=1` ב-`functions/.env.local`) כך שלא יוצא כסף.

הרצה מקומית: `npm run serve` ואז http://localhost:8150/usa-trip-2027/ (מצב הדגמה על נתוני הפתיחה; `?demo=editor` לנסות עריכה). מול אמולטורים: `npm run emulators` ואז `?emu=1`.

## לפני שמראים לאבא — בדיקה בטלפונים אמיתיים
- [ ] קישור מוואטסאפ באייפון נפתח בספארי, הסכום ברור, אין גלילה הצידה.
- [ ] באנדרואיד (כרום) אותו דבר.
- [ ] כניסה עם גוגל עובדת ונשמרת (לא צריך להיכנס שוב).
- [ ] שאלה בהקלטה דרך המיקרופון של המקלדת.
- [ ] כפתור "הקראה" קורא בעברית (אם אין קול עברי בטלפון — הכפתור לא מופיע).
- [ ] אם וואטסאפ פותח דפדפן פנימי — מופיעה ההודעה "פתחו בכרום / בספארי".

---

# USA trip hub (English)

A Hebrew, right-to-left website that answers "how much will the whole trip cost, and what is already booked?" for an 8-person family trip (30 Sep – 18 Oct 2027), readable by a non-technical parent on a phone.

- **Public link (no login):** the route only — cities, dates, nights, holidays. No prices, no AI.
- **Family (one Google sign-in; the "כניסה" button is at the top of every page):** also "Ask the trip" about the route (Claude answers in plain Hebrew; keyboard dictation works). Still no prices — the model isn't given any for them.
- **Editors:** everything — the total, categories, options, documents, history — and change it by hand or by asking Claude; Claude only *proposes* (a reviewed list of changes), an editor approves.

Everything is data: stops, categories, rows, prices, travellers, units, options and the home-page layout live in Firestore (`trips/usa2027/plan/state` and `private/state`, editors only). The functions regenerate the price-free `public/state` route from the plan on every change. The engine in `docs/js/shared/` is pure JS shared by the browser and the Cloud Functions.

**Layout**
| Path | What |
|---|---|
| `docs/` | the static site (GitHub Pages) — `js/shared` engine, `js/views` screens, `js/edit` editor, `data/seed-data.json` opening data |
| `functions/` | Cloud Functions (TypeScript, Node 24, me-west1): `commitChange`, `undoChange`, `whoami`, `getAccess`/`setAccess`, `adminImport`, `aiAsk`, `aiPropose`, `applyProposal`/`rejectProposal`, `addDocument` |
| `firestore.rules`, `storage.rules` | access rules (the price-free route readable by anyone; plan, private data, history and documents editors only; no browser writes to trip data) |
| `seed/reference-prices.md` | researched prices — background knowledge for the AI, not rows |
| `tests/` | unit tests (`npm test`), rules tests and emulator end-to-end tests (`npm run test:all`) |
| `notes/` | `ai.md` (Claude usage, verified SDK shapes, costs), `data-model.md`, `runbook.md` |

Setup steps are in the Hebrew section above (Firebase project on Blaze, Google sign-in, config in `docs/js/config.js`, `OWNER_EMAIL` in `functions/.env`, `ANTHROPIC_API_KEY` as a Firebase secret, deploy, GitHub Pages from `main /docs`, then "load opening data" in Settings → Backup).

Icons: [Lucide](https://lucide.dev) (ISC). Fonts: Heebo and Rubik (Google Fonts, OFL).
