import { getAuth, type Auth } from "firebase/auth";
import { getFirebaseApp } from "./app";

/** Firebase Auth instance bound to the app singleton. */
export const getFirebaseAuth = (): Auth => getAuth(getFirebaseApp());
