import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const REGION = "me-west1"; // Tel Aviv, next to the family
export const TRIP_ID = "usa2027";

export const paths = {
  pub: `trips/${TRIP_ID}/public/state`,
  priv: `trips/${TRIP_ID}/private/state`,
  changes: `trips/${TRIP_ID}/changes`,
  backups: `trips/${TRIP_ID}/backups`,
  proposals: `trips/${TRIP_ID}/proposals`,
  documents: `trips/${TRIP_ID}/documents`,
  usage: `trips/${TRIP_ID}/usage`,
  access: "config/access",
};
