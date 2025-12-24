import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";
import { projectID } from "firebase-functions/params";

const db = admin.firestore();

// Initialize at runtime
const location = "asia-northeast1";

interface SearchRequest {
    noteId: string;
    limit?: number;
    queryText?: string;
}

// Simple Cosine Similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    // Avoid division by zero
    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const searchRelated = onCall<SearchRequest>({
    region: "asia-northeast1",
    memory: "512MiB"
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    const uid = request.auth.uid;
    const { noteId, queryText } = request.data;
    const limitVal = request.data.limit || 5;

    let targetEmbedding: number[] = [];
    let targetSectionEmbeddings: number[][] = [];

    // 1. Determine Target Embedding
    if (queryText && queryText.length > 10) {
        // Real-time mode: Embed the query text
        const vertexAI = new VertexAI({ location, project: projectID.value() });
        const model = vertexAI.getGenerativeModel({ model: "text-embedding-004" });

        const result = await model.embedContent(queryText);

        if (result.embedding?.values) {
            targetEmbedding = result.embedding.values;
            // For queryText, we treat it as a single section, so targetSectionEmbeddings is just it.
            targetSectionEmbeddings = [targetEmbedding];
        } else {
            console.error("Failed to generate embedding for queryText");
            // Fallback or just empty
        }

    } else {
        // Stored mode: Fetch Note Embedding
        const targetDoc = await db.collection("notes").doc(noteId).get();
        if (!targetDoc.exists || targetDoc.data()?.userId !== uid) {
            // If valid queryText wasn't provided, and note doesn't exist, error.
            if (!queryText) throw new HttpsError("not-found", "Note not found or access denied.");
        }

        // If note exists
        if (targetDoc.exists) {
            targetEmbedding = targetDoc.data()?.embedding as number[];
            // 1b. Fetch Target Note Sections
            const targetSectionsSnap = await db.collection("notes").doc(noteId).collection("sections").get();
            targetSectionsSnap.forEach(doc => {
                const data = doc.data();
                if (data.embedding) targetSectionEmbeddings.push(data.embedding);
            });
        }
    }

    if (!targetEmbedding || targetEmbedding.length === 0) {
        return { results: [] };
    }

    // 2. Fetch Candidates (Notes)
    const notesSnap = await db.collection("notes")
        .where("userId", "==", uid)
        .select("embedding", "markdown", "updatedAt", "title")
        .get();

    // 2b. Fetch Candidates (Sections)
    const sectionsSnap = await db.collectionGroup("sections")
        .where("userId", "==", uid)
        .select("embedding", "noteId")
        .get();

    // 3. Calculate Similarity (Max Pooling Strategy)
    // Map noteId -> { score, doc }
    const noteScores = new Map<string, { score: number; doc: any }>();

    // A. Init with Note-level scores
    notesSnap.forEach(doc => {
        if (doc.id === noteId) return;
        const data = doc.data();
        const score = cosineSimilarity(targetEmbedding, data.embedding);
        noteScores.set(doc.id, { score, doc });
    });

    // B. Chapter x Chapter Analysis
    // We want the HIGHEST similarity found between any part of Target and any part of Candidate.

    // Cache candidate section embeddings by NoteID for faster lookup if optimized,
    // but here we iterate stream.

    sectionsSnap.forEach(doc => {
        const data = doc.data();
        const candidateNoteId = data.noteId;
        if (candidateNoteId === noteId) return; // Skip self parts

        const candidateEmbedding = data.embedding;
        if (!candidateEmbedding) return;

        // 1. Target Note vs Candidate Section
        let maxScoreForThisSection = cosineSimilarity(targetEmbedding, candidateEmbedding);

        // 2. Target Section vs Candidate Section (The User's Request)
        for (const targetSecEmb of targetSectionEmbeddings) {
            const s = cosineSimilarity(targetSecEmb, candidateEmbedding);
            if (s > maxScoreForThisSection) maxScoreForThisSection = s;
        }

        // Update the parent note's score if this section match is better
        const existing = noteScores.get(candidateNoteId);
        if (existing) {
            if (maxScoreForThisSection > existing.score) {
                existing.score = maxScoreForThisSection;
            }
        }
    });

    // 4. Sort and Return
    const results = Array.from(noteScores.entries()).map(([id, val]) => ({
        id: id,
        score: val.score,
        markdown: val.doc.data().markdown || "",
        date: val.doc.data().updatedAt
    }));

    results.sort((a, b) => b.score - a.score);

    const topResults = results.slice(0, limitVal);

    return { results: topResults };
});
