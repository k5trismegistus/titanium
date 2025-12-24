import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateEmbedding } from "./embedding";

const db = admin.firestore();

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
    try {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }
        const uid = request.auth.uid;
        const { noteId, queryText } = request.data;
        const limitVal = request.data.limit || 5;

        let targetEmbedding: number[] = [];
        let targetSectionEmbeddings: number[][] = [];

        const loadStoredEmbeddings = async () => {
            if (!noteId) return false;
            try {
                const targetDoc = await db.collection("notes").doc(noteId).get();
                if (!targetDoc.exists || targetDoc.data()?.userId !== uid) {
                    return false;
                }

                targetEmbedding = targetDoc.data()?.embedding as number[];
                const targetSectionsSnap = await db.collection("notes").doc(noteId).collection("sections").get();
                targetSectionEmbeddings = [];
                targetSectionsSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.embedding) targetSectionEmbeddings.push(data.embedding);
                });
                return true;
            } catch (e) {
                console.error("Failed to load stored embeddings:", e);
                return false;
            }
        };

        // 1. Determine Target Embedding
        if (queryText && queryText.length > 10) {
            // Real-time mode: Embed the query text
            try {
                const embedding = await generateEmbedding(queryText, undefined, "RETRIEVAL_QUERY");
                if (embedding && embedding.length > 0) {
                    targetEmbedding = embedding;
                    // For queryText, we treat it as a single section, so targetSectionEmbeddings is just it.
                    targetSectionEmbeddings = [targetEmbedding];
                } else {
                    console.error("Failed to generate embedding for queryText");
                }
            } catch (e) {
                console.error("Embedding generation failed for queryText:", e);
            }
        }

        if (!targetEmbedding || targetEmbedding.length === 0) {
            // Stored mode: Fetch Note Embedding
            const loaded = await loadStoredEmbeddings();
            if (!loaded && !queryText) {
                throw new HttpsError("not-found", "Note not found or access denied.");
            }
        }

        if (!targetEmbedding || targetEmbedding.length === 0) {
            return { results: [] };
        }

        // 2. Fetch Candidates (Notes)
        let notesSnap;
        try {
            notesSnap = await db.collection("notes")
                .where("userId", "==", uid)
                .select("embedding", "markdown", "updatedAt", "title")
                .get();
        } catch (e) {
            console.error("Failed to fetch notes for search:", e);
            return { results: [] };
        }

        // 2b. Fetch Candidates (Sections)
        let sectionsSnap = null;
        try {
            sectionsSnap = await db.collectionGroup("sections")
                .where("userId", "==", uid)
                .select("embedding", "noteId")
                .get();
        } catch (e) {
            console.error("Failed to fetch sections for search:", e);
        }

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
        if (sectionsSnap) {
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
        }

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
    } catch (e: any) {
        console.error("searchRelated failed:", e);
        const code = e?.code ? String(e.code) : "unknown";
        const message = e?.message || "searchRelated failed";
        throw new HttpsError("internal", `${message} (code=${code})`);
    }
});
