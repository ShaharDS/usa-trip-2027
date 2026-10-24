// Signed-in session: who you are (asked from the server), then the private document for family and live
// updates for editors. Started on return visits (remembered session) or when someone taps "sign in".
import { setState, store } from "../store.js";
import { watchUser } from "../fb/auth.js";
import { callFunction } from "../fb/api.js";
import { readPrivateOnce, watchDocs } from "./live.js";

let started = false;
let stopLive = null;

export function startSession() {
  if (started) return;
  started = true;
  watchUser(async (user) => {
    stopLive?.();
    stopLive = null;
    if (!user) {
      setState({ user: null, role: "public", roleChecked: true, docs: { pub: store.docs.pub, priv: null } });
      return;
    }
    setState({ user: { uid: user.uid, email: user.email, name: user.displayName || "" }, role: "public", roleChecked: false });
    let role = "public";
    try {
      const who = await callFunction("whoami", {});
      role = who.role || "public";
      if (who.label && role !== "public") setState({ user: { ...store.user, name: who.label } });
    } catch {
      role = "public";
    }
    setState({ role, roleChecked: true });
    if (role === "public") return;
    try {
      if (role === "editor" || role === "owner") {
        stopLive = await watchDocs(
          (patch) => setState({
            docs: { pub: patch.pub !== undefined ? patch.pub ?? store.docs.pub : store.docs.pub, priv: patch.priv !== undefined ? patch.priv ?? {} : store.docs.priv },
            ...(patch.pub ? { source: "firestore", error: null } : {}),
          }),
          () => setState({ error: "החיבור לעדכונים חיים נקטע. רעננו את הדף." }),
        );
      } else {
        const priv = await readPrivateOnce();
        setState({ docs: { pub: store.docs.pub, priv: priv || {} } });
      }
    } catch {
      setState({ error: "לא הצלחנו לטעון את הפרטים הפרטיים." });
    }
  });
}
