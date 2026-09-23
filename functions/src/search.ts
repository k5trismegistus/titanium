import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateEmbedding } from './embedding';
import { VECTOR_DIMENSION } from './vectorConfig';

const db = admin.firestore();

interface SearchRequest {
  noteId: string;
  limit?: number;
  queryText?: string;
}

interface SearchNotesRequest {
  queryText: string;
  limit?: number;
}

type NoteResult = { id: string; markdown: string; date: any };

type AggregatedCandidate = {
  noteId: string;
  score: number;
  bestRank: number;
};

const toEmbeddingArray = (embedding: unknown): number[] => {
  if (!embedding) return [];
  if (Array.isArray(embedding)) return embedding;
  const vector = embedding as { toArray?: () => number[] };
  if (typeof vector.toArray === 'function') {
    return vector.toArray();
  }
  return [];
};

const isValidEmbedding = (embedding: number[]): boolean =>
  embedding.length === VECTOR_DIMENSION &&
  embedding.every((value) => typeof value === 'number' && Number.isFinite(value));

const MIN_QUERY_TEXT_LENGTH = 1;
const MAX_SALIENT_QUERY_EMBEDDINGS = 3;

const buildNoteResults = (docs: admin.firestore.DocumentSnapshot[]): NoteResult[] =>
  docs.map((doc) => {
    const data = doc.data() as admin.firestore.DocumentData | undefined;
    return {
      id: doc.id,
      markdown: typeof data?.markdown === 'string' ? data.markdown : '',
      date: data?.updatedAt,
    };
  });

const fetchNoteVectorResults = async (
  uid: string,
  targetEmbedding: number[],
  limitVal: number,
  excludeNoteId?: string,
  existingIds: Set<string> = new Set(),
): Promise<NoteResult[]> => {
  const fetchLimit = Math.min(limitVal + 2, 10);
  let vectorSnap: any;
  try {
    vectorSnap = await db
      .collection('notes')
      .where('userId', '==', uid)
      .findNearest('embedding', targetEmbedding, {
        limit: fetchLimit,
        distanceMeasure: 'EUCLIDEAN',
      })
      .get();
  } catch (e) {
    console.error('Failed to run note vector search:', e);
    return [];
  }

  const filteredDocs = vectorSnap.docs.filter((doc: admin.firestore.QueryDocumentSnapshot) => {
    if (excludeNoteId && doc.id === excludeNoteId) return false;
    if (existingIds.has(doc.id)) return false;
    return true;
  });

  return buildNoteResults(filteredDocs.slice(0, limitVal));
};

const loadStoredSalientEmbeddings = async (
  noteRef: admin.firestore.DocumentReference,
  limitVal: number,
): Promise<number[][]> => {
  let docs: admin.firestore.QueryDocumentSnapshot[] = [];

  try {
    const ordered = await noteRef
      .collection('salientItems')
      .orderBy('salienceScore', 'desc')
      .limit(limitVal)
      .get();
    docs = ordered.docs;
  } catch (e) {
    console.warn('Failed to load ordered salient items, falling back to unordered fetch:', e);
  }

  if (docs.length === 0) {
    try {
      const fallback = await noteRef.collection('salientItems').limit(limitVal).get();
      docs = fallback.docs;
    } catch (e) {
      console.warn('Failed to load salient items:', e);
      return [];
    }
  }

  return docs
    .map((doc) => toEmbeddingArray(doc.data()?.embedding))
    .filter((embedding) => isValidEmbedding(embedding));
};

const fetchNotesByIds = async (uid: string, noteIds: string[]): Promise<NoteResult[]> => {
  if (noteIds.length === 0) return [];

  const snaps = await Promise.all(
    noteIds.map((noteId) => db.collection('notes').doc(noteId).get()),
  );

  const orderedDocs: admin.firestore.DocumentSnapshot[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data();
    if (data?.userId !== uid) continue;
    orderedDocs.push(snap);
  }

  return buildNoteResults(orderedDocs);
};

const fetchSalientCandidatesForEmbedding = async (
  uid: string,
  targetEmbedding: number[],
  limitVal: number,
  excludeNoteId?: string,
): Promise<Map<string, AggregatedCandidate>> => {
  const fetchLimit = Math.min(Math.max(limitVal * 8, 20), 60);
  let vectorSnap: any;
  try {
    vectorSnap = await db
      .collectionGroup('salientItems')
      .where('userId', '==', uid)
      .findNearest('embedding', targetEmbedding, {
        limit: fetchLimit,
        distanceMeasure: 'EUCLIDEAN',
      })
      .get();
  } catch (e) {
    console.error('Failed to run salient item vector search:', e);
    return new Map();
  }

  const candidates = new Map<string, AggregatedCandidate>();
  vectorSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot, index: number) => {
    const data = doc.data();
    const noteId = typeof data?.noteId === 'string' ? data.noteId : '';
    if (!noteId) return;
    if (excludeNoteId && noteId === excludeNoteId) return;

    const hitScore = Math.max(fetchLimit - index, 1);
    const existing = candidates.get(noteId);
    if (!existing) {
      candidates.set(noteId, {
        noteId,
        score: hitScore,
        bestRank: index,
      });
      return;
    }

    // 同一ノート内では最も強い hit だけを採用し、累積加点しない。
    if (hitScore > existing.score) {
      existing.score = hitScore;
      existing.bestRank = index;
      return;
    }

    if (hitScore === existing.score) {
      existing.bestRank = Math.min(existing.bestRank, index);
    }
  });

  return candidates;
};

const fetchRelatedBySalientEmbeddings = async (
  uid: string,
  targetEmbeddings: number[][],
  limitVal: number,
  excludeNoteId?: string,
): Promise<NoteResult[]> => {
  if (targetEmbeddings.length === 0) return [];

  const merged = new Map<string, AggregatedCandidate>();
  for (const embedding of targetEmbeddings.slice(0, MAX_SALIENT_QUERY_EMBEDDINGS)) {
    if (!isValidEmbedding(embedding)) continue;
    const partial = await fetchSalientCandidatesForEmbedding(
      uid,
      embedding,
      limitVal,
      excludeNoteId,
    );
    for (const candidate of partial.values()) {
      const existing = merged.get(candidate.noteId);
      if (!existing) {
        merged.set(candidate.noteId, { ...candidate });
        continue;
      }

      // 複数クエリでも、ノート単位では最も強い hit だけを採用する。
      if (candidate.score > existing.score) {
        existing.score = candidate.score;
        existing.bestRank = candidate.bestRank;
        continue;
      }

      if (candidate.score === existing.score) {
        existing.bestRank = Math.min(existing.bestRank, candidate.bestRank);
      }
    }
  }

  if (merged.size === 0) return [];

  const rankedIds = Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank)
    .slice(0, limitVal)
    .map((candidate) => candidate.noteId);

  return fetchNotesByIds(uid, rankedIds);
};

const isAllowedUser = async (uid: string) => {
  const userDoc = await db.collection('allowedUsers').doc(uid).get();
  return userDoc.exists && userDoc.data()?.allowed === true;
};

export const searchRelated = onCall<SearchRequest>(
  {
    region: 'asia-northeast1',
    memory: '512MiB',
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
      }
      const uid = request.auth.uid;
      const { noteId, queryText } = request.data;
      const safeNoteId = typeof noteId === 'string' ? noteId.trim() : '';
      const resolvedNoteId = safeNoteId === 'scratchpad' ? `scratchpad-${uid}` : safeNoteId;
      const limitVal = Math.min(request.data.limit ?? 5, 5);
      if (limitVal <= 0) {
        return { results: [] };
      }

      let targetEmbeddings: number[][] = [];
      const safeQueryText = typeof queryText === 'string' ? queryText.trim() : '';
      const hasQueryText = safeQueryText.length >= MIN_QUERY_TEXT_LENGTH;
      let usedQueryEmbedding = false;
      let queryEmbeddingLength = 0;
      let queryEmbeddingValid = false;
      let noteLevelFallbackEmbedding: number[] = [];
      let loadedStoredNote = false;

      const loadStoredEmbeddings = async () => {
        if (!resolvedNoteId) return false;
        try {
          const targetDoc = await db.collection('notes').doc(resolvedNoteId).get();
          if (!targetDoc.exists || targetDoc.data()?.userId !== uid) {
            return false;
          }

          noteLevelFallbackEmbedding = toEmbeddingArray(targetDoc.data()?.embedding);
          if (!isValidEmbedding(noteLevelFallbackEmbedding)) {
            if (noteLevelFallbackEmbedding.length > 0) {
              console.error(
                `Stored note embedding is invalid (len=${noteLevelFallbackEmbedding.length})`,
              );
            }
            noteLevelFallbackEmbedding = [];
          }

          targetEmbeddings = await loadStoredSalientEmbeddings(
            targetDoc.ref,
            MAX_SALIENT_QUERY_EMBEDDINGS,
          );
          return true;
        } catch (e) {
          console.error('Failed to load stored embeddings:', e);
          return false;
        }
      };

      // 1. 検索に使う埋め込みを決める
      if (hasQueryText) {
        // リアルタイム検索: クエリ本文を埋め込み化する
        try {
          const embedding = await generateEmbedding(safeQueryText, undefined, 'RETRIEVAL_QUERY');
          queryEmbeddingLength = embedding?.length ?? 0;
          queryEmbeddingValid = isValidEmbedding(embedding);
          if (embedding && queryEmbeddingValid) {
            targetEmbeddings = [embedding];
            usedQueryEmbedding = true;
            noteLevelFallbackEmbedding = embedding;
          } else {
            console.error(
              `Failed to generate valid embedding for queryText (len=${embedding?.length ?? 0})`,
            );
          }
        } catch (e) {
          console.error('Embedding generation failed for queryText:', e);
        }
      }

      if (targetEmbeddings.length === 0) {
        // 保存済みノート検索: ノート側の埋め込みを読む
        loadedStoredNote = await loadStoredEmbeddings();
        if (!loadedStoredNote && safeQueryText.length === 0) {
          throw new HttpsError('not-found', 'Note not found or access denied.');
        }
      }

      if (hasQueryText) {
        console.log(
          `searchRelated queryText len=${safeQueryText.length} embedding len=${queryEmbeddingLength} valid=${queryEmbeddingValid} usedQueryEmbedding=${usedQueryEmbedding} targetEmbeddings=${targetEmbeddings.length}`,
        );
      }

      // 2. salient item の kNN ベクトル検索で候補を取る
      if (targetEmbeddings.length > 0) {
        const results = await fetchRelatedBySalientEmbeddings(
          uid,
          targetEmbeddings,
          limitVal,
          resolvedNoteId,
        );
        if (results.length > 0) {
          return { results };
        }
      }

      // 3. ノート単位の kNN ベクトル検索へフォールバックする
      if (isValidEmbedding(noteLevelFallbackEmbedding)) {
        const results = await fetchNoteVectorResults(
          uid,
          noteLevelFallbackEmbedding,
          limitVal,
          resolvedNoteId,
        );
        return { results };
      }

      if (!loadedStoredNote && !hasQueryText) {
        throw new HttpsError('not-found', 'Note not found or access denied.');
      }

      return { results: [] };
    } catch (e: any) {
      console.error('searchRelated failed:', e);
      const code = e?.code ? String(e.code) : 'unknown';
      const message = e?.message || 'searchRelated failed';
      throw new HttpsError('internal', `${message} (code=${code})`);
    }
  },
);

export const searchNotes = onCall<SearchNotesRequest>(
  {
    region: 'asia-northeast1',
    memory: '512MiB',
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
      }

      const uid = request.auth.uid;
      if (!(await isAllowedUser(uid))) {
        throw new HttpsError('permission-denied', 'User is not in the whitelist.');
      }

      const safeQueryText =
        typeof request.data.queryText === 'string' ? request.data.queryText.trim() : '';
      if (safeQueryText.length < MIN_QUERY_TEXT_LENGTH) {
        return { results: [] };
      }

      const limitVal = Math.min(request.data.limit ?? 5, 5);
      if (limitVal <= 0) {
        return { results: [] };
      }

      let targetEmbedding: number[] = [];
      try {
        const embedding = await generateEmbedding(safeQueryText, undefined, 'RETRIEVAL_QUERY');
        if (embedding && isValidEmbedding(embedding)) {
          targetEmbedding = embedding;
        } else {
          console.error(
            `Failed to generate valid embedding for searchNotes (len=${embedding?.length ?? 0})`,
          );
        }
      } catch (e) {
        console.error('Embedding generation failed for searchNotes:', e);
      }

      if (targetEmbedding.length === 0) {
        return { results: [] };
      }

      const results = await fetchNoteVectorResults(uid, targetEmbedding, limitVal);
      return { results };
    } catch (e: any) {
      console.error('searchNotes failed:', e);
      const code = e?.code ? String(e.code) : 'unknown';
      const message = e?.message || 'searchNotes failed';
      throw new HttpsError('internal', `${message} (code=${code})`);
    }
  },
);
