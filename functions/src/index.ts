import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./mix";
export * from "./triggers";
export * from "./search";
export * from "./quickWord";
// export * from "./embedding"; // Deprecated/stub
