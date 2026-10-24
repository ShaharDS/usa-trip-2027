// Signed-in session: who you are (asked from the server), then live updates of the plan for editors.
// Family needs nothing more than the public route. Started on return visits (remembered session) or when
// someone taps "כניסה".
import { setState, store } from "../store.js";
import { watchUser } from "../fb/auth.js";
import { callFunction } from "../fb/api.js";
import { watchDocs } from "./live.js";

let started = false;
let stopLive = null;
const NO_DOCS = { plan: undefined, priv: undefined };

export function startSession() {
  if (started) return;
  started = true;
  watchUser(async (user) => {
    stopLive?.();
    stopLive = null;
    if (!user) {
      setState({ user: null, role: "public", roleChecked: true, docs: NO_DOCS });
      return;
    }
    setState({ user: { uid: user.uid, email: user.email, name: user.displayName || "" }, role: "public", roleChecked: false, docs: NO_DOCS });
    let role = "public";
    try {
      const who = await callFunction("whoami", {});
      role = who.role || "public";
      if (who.label && role !== "public") setState({ user: { ...store.user, name: who.label } });
    } catch {
      role = "public";
    }
    setState({ role, roleChecked: true });
    if (role !== "editor" && role !== "owner") return;
    try {
      stopLive = await watchDocs(
        (patch) => setState({
          docs: {
            plan: "plan" in patch ? patch.plan : store.docs.plan,
            priv: "priv" in patch ? patch.priv ?? {} : store.docs.priv,
          },
        }),
        () => setState({ error: "החיבור לעדכונים חיים נקטע. רעננו את הדף." }),
      );
    } catch {
      setState({ error: "לא הצלחנו לטעון את נתוני הטיול המלאים." });
    }
  });
}
