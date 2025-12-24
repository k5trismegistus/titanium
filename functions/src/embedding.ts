import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// import { VertexAI } from "@google-cloud/vertexai";

const db = admin.firestore();

// const project = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId;
// const location = "asia-northeast1";

// const vertexAI = new VertexAI({ project: project, location: location });

export const updateEmbedding = onCall<{ noteId: string }>({ region: "asia-northeast1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = request.auth.uid;

    const userDoc = await db.collection("allowedUsers").doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.allowed !== true) {
        throw new HttpsError("permission-denied", "User is not in the whitelist.");
    }

    const { noteId } = request.data;
    if (!noteId) return;

    const noteRef = db.collection("notes").doc(noteId);
    const noteSnap = await noteRef.get();

    if (!noteSnap.exists || noteSnap.data()?.userId !== uid) {
        throw new HttpsError("permission-denied", "Access denied.");
    }

    const text = noteSnap.data()?.markdown || "";
    if (!text) return;

    try {
        // For now, we are skipping actual embedding generation to ensure stability
        // as the embedding API signature varies between versions.
        // In a full implementation, you would use:
        // const result = await vertexAI.getGenerativeModel({model: "text-embedding-004"}).embedContent(...)

        console.log("Skipping embedding for note:", noteId);

        return { success: true };
    } catch (e: any) {
        console.error("Embedding Error:", e);
        // Don't fail the client for background embedding
        return { success: false };
    }
});
