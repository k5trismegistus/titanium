import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateEmbedding } from "./embedding";
import { VECTOR_DIMENSION } from "./vectorConfig";

const db = admin.firestore();

interface SearchRequest {
  noteId: string;
  limit?: number;
  queryText?: string;
}

const toEmbeddingArray = (embedding: unknown): number[] => {
  if (!embedding) return [];
  if (Array.isArray(embedding)) return embedding;
  const vector = embedding as { toArray?: () => number[] };
  if (typeof vector.toArray === "function") {
    return vector.toArray();
  }
  return [];
};

const isValidEmbedding = (embedding: number[]): boolean => (
  embedding.length === VECTOR_DIMENSION && embedding.every((value) => typeof value === "number" && Number.isFinite(value))
);

const MIN_QUERY_TEXT_LENGTH = 1;

const buildNoteResults = (docs: admin.firestore.DocumentSnapshot[]): { id: string; markdown: string; date: any }[] => (
  docs.map((doc) => {
    const data = doc.data() as admin.firestore.DocumentData | undefined;
    return {
      id: doc.id,
      markdown: typeof data?.markdown === "string" ? data.markdown : "",
      date: data?.updatedAt,
    };
  })
);

const fetchNoteVectorResults = async (
  uid: string,
  targetEmbedding: number[],
  limitVal: number,
  excludeNoteId?: string,
  existingIds: Set<string> = new Set()
): Promise<{ id: string; markdown: string; date: any }[]> => {
  const fetchLimit = Math.min(limitVal * 5, 50);
  let vectorSnap: any;
  try {
    vectorSnap = await db
      .collection("notes")
      .where("userId", "==", uid)
      .findNearest("embedding", targetEmbedding, {
        limit: fetchLimit,
        distanceMeasure: "COSINE",
      })
      .get();
  } catch (e) {
    console.error("Failed to run note vector search:", e);
    return [];
  }

  const filteredDocs = vectorSnap.docs.filter((doc: admin.firestore.QueryDocumentSnapshot) => {
    if (excludeNoteId && doc.id === excludeNoteId) return false;
    if (existingIds.has(doc.id)) return false;
    return true;
  });

  return buildNoteResults(filteredDocs.slice(0, limitVal));
};

export const searchRelated = onCall<SearchRequest>(
  {
    region: "asia-northeast1",
    memory: "512MiB",
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
      }
      const uid = request.auth.uid;
      const { noteId, queryText } = request.data;
      const safeNoteId = typeof noteId === "string" ? noteId.trim() : "";
      const resolvedNoteId = safeNoteId === "scratchpad" ? `scratchpad-${uid}` : safeNoteId;
      const limitVal = Math.min(request.data.limit ?? 5, 5);
      if (limitVal <= 0) {
        return { results: [] };
      }

      let targetEmbedding: number[] = [];
      const safeQueryText = typeof queryText === "string" ? queryText.trim() : "";
      const hasQueryText = safeQueryText.length >= MIN_QUERY_TEXT_LENGTH;
      let usedQueryEmbedding = false;
      let queryEmbeddingLength = 0;
      let queryEmbeddingValid = false;

      const loadStoredEmbeddings = async () => {
        if (!resolvedNoteId) return false;
        try {
          const targetDoc = await db.collection("notes").doc(resolvedNoteId).get();
          if (!targetDoc.exists || targetDoc.data()?.userId !== uid) {
            return false;
          }

          targetEmbedding = toEmbeddingArray(targetDoc.data()?.embedding);
          if (!isValidEmbedding(targetEmbedding)) {
            console.error(`Stored note embedding is invalid (len=${targetEmbedding.length})`);
            targetEmbedding = [];
            return false;
          }
          return true;
        } catch (e) {
          console.error("Failed to load stored embeddings:", e);
          return false;
        }
      };

      // 1. Determine Target Embedding
      if (hasQueryText) {
        // Real-time mode: Embed the query text
        try {
          const embedding = await generateEmbedding(
            safeQueryText,
            undefined,
            "RETRIEVAL_QUERY"
          );
          queryEmbeddingLength = embedding?.length ?? 0;
          queryEmbeddingValid = isValidEmbedding(embedding);
          if (embedding && isValidEmbedding(embedding)) {
            targetEmbedding = embedding;
            usedQueryEmbedding = true;
          } else {
            console.error(`Failed to generate valid embedding for queryText (len=${embedding?.length ?? 0})`);
          }
        } catch (e) {
          console.error("Embedding generation failed for queryText:", e);
        }
      }

      if (targetEmbedding.length === 0) {
        // Stored mode: Fetch Note Embedding
        const loaded = await loadStoredEmbeddings();
        if (!loaded && safeQueryText.length === 0) {
          throw new HttpsError("not-found", "Note not found or access denied.");
        }
      }

      if (targetEmbedding.length === 0) {
        return { results: [] };
      }

      if (hasQueryText) {
        console.log(`searchRelated queryText len=${safeQueryText.length} embedding len=${queryEmbeddingLength} valid=${queryEmbeddingValid} usedQueryEmbedding=${usedQueryEmbedding} targetEmbeddingLen=${targetEmbedding.length}`);
      }

      // 2. Fetch Candidates via kNN Vector Search
      if (usedQueryEmbedding) {
        const fetchLimit = Math.min(limitVal * 20, 200);
        let sectionSnap;
        try {
          sectionSnap = await db
            .collectionGroup("sections")
            .where("userId", "==", uid)
            .findNearest("embedding", targetEmbedding, {
              limit: fetchLimit,
              distanceMeasure: "COSINE",
            })
            .get();
        } catch (e) {
          console.error("Failed to run section vector search:", e);
          const fallbackResults = await fetchNoteVectorResults(uid, targetEmbedding, limitVal, resolvedNoteId);
          return { results: fallbackResults };
        }
        console.log(`searchRelated sectionSnap docs=${sectionSnap.docs.length}`);

        const seenNotes = new Set<string>();
        const orderedNoteIds: string[] = [];
        sectionSnap.docs.forEach((doc) => {
          const data = doc.data();
          const derivedNoteId = doc.ref.parent.parent?.id ?? "";
          const dataNoteId = typeof data.noteId === "string" ? data.noteId : "";
          const sectionNoteId = derivedNoteId || dataNoteId;
          if (!sectionNoteId) return;
          if (resolvedNoteId && sectionNoteId === resolvedNoteId) return;
          if (seenNotes.has(sectionNoteId)) return;
          seenNotes.add(sectionNoteId);
          orderedNoteIds.push(sectionNoteId);
        });

        if (orderedNoteIds.length === 0) {
          const fallbackResults = await fetchNoteVectorResults(uid, targetEmbedding, limitVal, resolvedNoteId);
          return { results: fallbackResults };
        }

        const noteDocs = await Promise.all(
          orderedNoteIds
            .filter((id) => id && id !== resolvedNoteId)
            .slice(0, limitVal)
            .map((id) => db.collection("notes").doc(id).get())
        );
        const results = buildNoteResults(
          noteDocs.filter((doc) => doc.exists && doc.data()?.userId === uid)
        );
        if (results.length >= limitVal) {
          return { results };
        }

        const existingIds = new Set(results.map((result) => result.id));
        const fallback = await fetchNoteVectorResults(uid, targetEmbedding, limitVal - results.length, resolvedNoteId, existingIds);
        return { results: [...results, ...fallback].slice(0, limitVal) };
      }

      const results = await fetchNoteVectorResults(uid, targetEmbedding, limitVal, resolvedNoteId);
      return { results };
    } catch (e: any) {
      console.error("searchRelated failed:", e);
      const code = e?.code ? String(e.code) : "unknown";
      const message = e?.message || "searchRelated failed";
      throw new HttpsError("internal", `${message} (code=${code})`);
    }
  }
);
