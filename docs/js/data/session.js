// Signed-in session: who you are (asked from the server), then live data — the family route for family, the plan
// for editors. Started on return visits (remembered session) or when someone taps "כניסה".
// The family route is also kept on this phone, so on the road with no reception the day screen still opens
// (with the hotel's address and the Waze / Google Maps buttons). Signing out removes it.
import { setState, store } from "../store.js";
import { watchUser } from "../fb/auth.js";
import { callFunction } from "../fb/api.js";
import { watchDocs, watchFamily } from "./live.js";
import { safeStorage } from "../ui/h.js";
import { familyView } from "../shared/route.js";

let started = false;
let stopLive = null;
const NO_DOCS = { plan: undefined, priv: undefined };
const FAMILY_CACHE = "usaTrip.familyCache";

function cacheFamily(uid, role, family) {
  if (family) safeStorage.set(FAMILY_CACHE, JSON.stringify({ uid, role, family }));
}
function cachedFamily(uid) {
  try {
    const c = JSON.parse(safeStorage.get(FAMILY_CACHE) || "null");
    return c?.uid === uid && c.family ? c : null;
  } catch {
    return null;
  }
}
export const forgetFamilyCache = () => safeStorage.remove(FAMILY_CACHE);

export function startSession() {
  if (started) return;
  started = true;
  watchUser(async (user) => {
    stopLive?.();
    stopLive = null;
    if (!user) {
      forgetFamilyCache();
      setState({ user: null, role: "public", roleChecked: true, docs: NO_DOCS, family: null });
      return;
    }
    setState({ user: { uid: user.uid, email: user.email, name: user.displayName || "" }, role: "public", roleChecked: false, docs: NO_DOCS });
    let role = "public";
    try {
      const who = await callFunction("whoami", {});
      role = who.role || "public";
      if (who.label && role !== "public") setState({ user: { ...store.user, name: who.label } });
    } catch (err) {
      // No connection (on the road): show what this phone saw the last time this account was signed in.
      const c = cachedFamily(user.uid);
      if (c && (err.code === "unavailable" || err.code === "deadline-exceeded" || err.code === "internal" || !navigator.onLine)) {
        setState({ role: c.role === "editor" || c.role === "owner" ? "family" : c.role, roleChecked: true, family: c.family, error: "אין חיבור כרגע — מוצג המסלול האחרון שנשמר בטלפון." });
        return;
      }
      role = "public";
    }
    setState({ role, roleChecked: true });
    if (role === "public") {
      forgetFamilyCache();
      return;
    }
    if (role === "family") {
      const c = cachedFamily(user.uid);
      if (c) setState({ family: c.family });
      try {
        stopLive = await watchFamily(
          (family) => {
            setState({ family });
            cacheFamily(user.uid, role, family);
          },
          () => setState({ error: "החיבור לעדכונים נקטע. רעננו את הדף." }),
        );
      } catch {
        setState({ error: "לא הצלחנו לטעון את פרטי המסלול." });
      }
      return;
    }
    try {
      let cachedAt = 0;
      stopLive = await watchDocs(
        (patch) => {
          setState({
            docs: {
              plan: "plan" in patch ? patch.plan : store.docs.plan,
              priv: "priv" in patch ? patch.priv ?? {} : store.docs.priv,
            },
          });
          // Editors keep an offline copy of the family route too (at most once a minute).
          if (store.docs.plan && Date.now() - cachedAt > 60_000) {
            cachedAt = Date.now();
            cacheFamily(user.uid, role, familyView(store.docs.plan));
          }
        },
        () => setState({ error: "החיבור לעדכונים חיים נקטע. רעננו את הדף." }),
      );
    } catch {
      setState({ error: "לא הצלחנו לטעון את נתוני הטיול המלאים." });
    }
  });
}
