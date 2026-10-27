import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseApp } from "./app";

/** Firestore instance bound to the app singleton. */
export const getFirebaseDb = (): Firestore => getFirestore(getFirebaseApp());
