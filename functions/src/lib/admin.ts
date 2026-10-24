import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const REGION = "me-west1"; // Tel Aviv, next to the family
export const TRIP_ID = "usa2027";

export const paths = {
  plan: `trips/${TRIP_ID}/plan/state`, // the whole trip with prices — editors only
  priv: `trips/${TRIP_ID}/private/state`, // booking codes, flights, AI settings — editors only
  route: `trips/${TRIP_ID}/public/state`, // price-free route for anyone with the link, derived from the plan
  changes: `trips/${TRIP_ID}/changes`,
  backups: `trips/${TRIP_ID}/backups`,
  proposals: `trips/${TRIP_ID}/proposals`,
  documents: `trips/${TRIP_ID}/documents`,
  usage: `trips/${TRIP_ID}/usage`,
  access: "config/access",
};
