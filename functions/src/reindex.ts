import * as admin from "firebase-admin";
import { generateEmbedding } from "./embedding";
import * as fs from "fs";
import * as path from "path";
import { VECTOR_DIMENSION } from "./vectorConfig";

const resolveEnvInt = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

const PAGE_SIZE = resolveEnvInt(process.env.REINDEX_PAGE_SIZE, 200);
const BATCH_SIZE = Math.min(resolveEnvInt(process.env.REINDEX_BATCH_SIZE, 200), 500);

const resolveProjectId = (): string | undefined => {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;
    if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_PROJECT) return process.env.FIREBASE_PROJECT;

    if (process.env.FIREBASE_CONFIG) {
        try {
            const cfg = JSON.parse(process.env.FIREBASE_CONFIG);
            if (cfg?.projectId) return cfg.projectId;
        } catch {
            // ignore parse errors
        }
    }

    const candidates = [
        path.resolve(__dirname, "..", "..", ".firebaserc"),
        path.resolve(__dirname, "..", "..", "..", ".firebaserc")
    ];

    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            const projects = data?.projects ?? {};
            if (typeof projects.default === "string") return projects.default;
            const ids = Object.values(projects).filter((val) => typeof val === "string") as string[];
            if (ids.length === 1) return ids[0];
            if (process.env.FIREBASE_PROJECT && typeof projects[process.env.FIREBASE_PROJECT] === "string") {
                return projects[process.env.FIREBASE_PROJECT];
            }
        } catch {
            // ignore parse errors
        }
    }

    return undefined;
};

const projectId = resolveProjectId();
if (projectId) {
    if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = projectId;
    if (!process.env.GCP_PROJECT) process.env.GCP_PROJECT = projectId;
}

admin.initializeApp(projectId ? { projectId } : undefined);
const db = admin.firestore();

const toEmbeddingArray = (embedding: unknown): number[] => {
    if (!embedding) return [];
    if (Array.isArray(embedding)) return embedding;
    const vector = embedding as { toArray?: () => number[] };
    if (typeof vector.toArray === "function") {
        return vector.toArray();
    }
    return [];
};

const isValidEmbeddingArray = (embedding: number[]): boolean => {
    if (embedding.length !== VECTOR_DIMENSION) return false;
    return embedding.every((value) => typeof value === "number" && Number.isFinite(value));
};

const skipGenerateMissing = process.argv.includes("--skip-generate") || process.env.REINDEX_SKIP_GENERATE === "1";
const forceRegenerate = process.argv.includes("--force") || process.env.REINDEX_FORCE === "1";

type ReindexStats = {
    scanned: number;
    updated: number;
    generated: number;
    skipped: number;
    failed: number;
};

type PendingUpdate = {
    ref: admin.firestore.DocumentReference;
    data: admin.firestore.UpdateData<admin.firestore.DocumentData>;
};

const commitBatchWithFallback = async (
    updates: PendingUpdate[],
    label: string,
    stats: ReindexStats
) => {
    if (updates.length === 0) return;

    const batch = db.batch();
    updates.forEach((update) => batch.update(update.ref, update.data));

    try {
        await batch.commit();
        stats.updated += updates.length;
        return;
    } catch (e) {
        console.error(`${label} batch commit failed; falling back to single writes.`, e);
    }

    for (const update of updates) {
        try {
            await update.ref.update(update.data);
            stats.updated += 1;
        } catch (err) {
            stats.failed += 1;
            console.error(`Failed to update ${update.ref.path}:`, err);
        }
    }
};

const reindexNotes = async (): Promise<ReindexStats> => {
    const notesRef = db.collection("notes");
    let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
    let pendingUpdates: PendingUpdate[] = [];

    const stats: ReindexStats = {
        scanned: 0,
        updated: 0,
        generated: 0,
        skipped: 0,
        failed: 0
    };

    while (true) {
        let query = notesRef
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(PAGE_SIZE);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snap = await query.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            stats.scanned += 1;
            const data = doc.data();
            const embedding = data.embedding;
            let embeddingArray: number[] = [];
            let usedGeneration = false;

            const storedEmbedding = toEmbeddingArray(embedding);
            const hasValidStored = storedEmbedding.length > 0 && isValidEmbeddingArray(storedEmbedding);
            if (hasValidStored && !forceRegenerate) {
                embeddingArray = storedEmbedding;
            } else if (!skipGenerateMissing || forceRegenerate) {
                const markdown = typeof data.markdown === "string" ? data.markdown.trim() : "";
                if (markdown.length > 0) {
                    try {
                        const generated = await generateEmbedding(markdown, undefined, "RETRIEVAL_DOCUMENT");
                        if (isValidEmbeddingArray(generated)) {
                            embeddingArray = generated;
                            usedGeneration = true;
                        }
                    } catch (e) {
                        console.error(`Embedding generation failed for note ${doc.id}:`, e);
                    }
                }
                if (embeddingArray.length === 0 && hasValidStored && forceRegenerate) {
                    console.warn(`Force regenerate failed for note ${doc.id}; keeping existing embedding.`);
                    embeddingArray = storedEmbedding;
                }
            } else if (hasValidStored) {
                embeddingArray = storedEmbedding;
            } else {
                stats.skipped += 1;
                continue;
            }

            if (embeddingArray.length === 0) {
                stats.skipped += 1;
                continue;
            }

            pendingUpdates.push({
                ref: doc.ref,
                data: {
                embedding: admin.firestore.FieldValue.vector(embeddingArray),
                embeddingUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            });
            if (usedGeneration) stats.generated += 1;

            if (pendingUpdates.length >= BATCH_SIZE) {
                await commitBatchWithFallback(pendingUpdates, "Notes", stats);
                pendingUpdates = [];
            }
        }

        if (pendingUpdates.length > 0) {
            await commitBatchWithFallback(pendingUpdates, "Notes", stats);
            pendingUpdates = [];
        }

        lastDoc = snap.docs[snap.docs.length - 1];
    }

    return stats;
};

const reindexSections = async (): Promise<ReindexStats> => {
    let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
    let pendingUpdates: PendingUpdate[] = [];
    const noteUserCache = new Map<string, string>();

    const stats: ReindexStats = {
        scanned: 0,
        updated: 0,
        generated: 0,
        skipped: 0,
        failed: 0
    };

    const resolveNoteUserId = async (noteId: string): Promise<string> => {
        if (!noteId) return "";
        const cached = noteUserCache.get(noteId);
        if (cached !== undefined) return cached;
        try {
            const noteDoc = await db.collection("notes").doc(noteId).get();
            const noteUserId = typeof noteDoc.data()?.userId === "string" ? noteDoc.data()?.userId : "";
            noteUserCache.set(noteId, noteUserId);
            return noteUserId;
        } catch (e) {
            console.error(`Failed to load note ${noteId} for section backfill:`, e);
            noteUserCache.set(noteId, "");
            return "";
        }
    };

    while (true) {
        let query = db
            .collectionGroup("sections")
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(PAGE_SIZE);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snap = await query.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            stats.scanned += 1;
            const data = doc.data();
            const embedding = data.embedding;
            let embeddingArray: number[] = [];
            let usedGeneration = false;
            const updateData: admin.firestore.UpdateData<admin.firestore.DocumentData> = {};
            let shouldUpdate = false;

            const storedEmbedding = toEmbeddingArray(embedding);
            const hasValidStored = storedEmbedding.length > 0 && isValidEmbeddingArray(storedEmbedding);
            if (hasValidStored && !forceRegenerate) {
                embeddingArray = storedEmbedding;
            } else if (!skipGenerateMissing || forceRegenerate) {
                const title = typeof data.title === "string" ? data.title.trim() : "";
                const content = typeof data.content === "string" ? data.content.trim() : "";
                const payload = [title, content].filter(Boolean).join("\n");
                if (payload.length > 0) {
                    try {
                        const generated = await generateEmbedding(payload, title || undefined, "RETRIEVAL_DOCUMENT");
                        if (isValidEmbeddingArray(generated)) {
                            embeddingArray = generated;
                            usedGeneration = true;
                        }
                    } catch (e) {
                        console.error(`Embedding generation failed for section ${doc.ref.path}:`, e);
                    }
                }
                if (embeddingArray.length === 0 && hasValidStored && forceRegenerate) {
                    console.warn(`Force regenerate failed for section ${doc.ref.path}; keeping existing embedding.`);
                    embeddingArray = storedEmbedding;
                }
            } else if (hasValidStored) {
                embeddingArray = storedEmbedding;
            }

            if (embeddingArray.length > 0) {
                updateData.embedding = admin.firestore.FieldValue.vector(embeddingArray);
                shouldUpdate = true;
            }

            const derivedNoteId = doc.ref.parent.parent?.id ?? "";
            const storedNoteId = typeof data.noteId === "string" ? data.noteId : "";
            const resolvedNoteId = derivedNoteId || storedNoteId;
            if (derivedNoteId && derivedNoteId !== storedNoteId) {
                updateData.noteId = derivedNoteId;
                shouldUpdate = true;
            }

            const storedUserId = typeof data.userId === "string" ? data.userId.trim() : "";
            let resolvedUserId = storedUserId;
            if (!resolvedUserId && resolvedNoteId) {
                resolvedUserId = await resolveNoteUserId(resolvedNoteId);
            }
            if (resolvedUserId && resolvedUserId !== storedUserId) {
                updateData.userId = resolvedUserId;
                shouldUpdate = true;
            }

            if (!shouldUpdate) {
                stats.skipped += 1;
                continue;
            }

            pendingUpdates.push({
                ref: doc.ref,
                data: updateData
            });
            if (usedGeneration) stats.generated += 1;

            if (pendingUpdates.length >= BATCH_SIZE) {
                await commitBatchWithFallback(pendingUpdates, "Sections", stats);
                pendingUpdates = [];
            }
        }

        if (pendingUpdates.length > 0) {
            await commitBatchWithFallback(pendingUpdates, "Sections", stats);
            pendingUpdates = [];
        }

        lastDoc = snap.docs[snap.docs.length - 1];
    }

    return stats;
};

const run = async () => {
    const noteStats = await reindexNotes();
    const sectionStats = await reindexSections();

    console.log("Reindex complete.");
    console.log(`Notes - Scanned: ${noteStats.scanned}`);
    console.log(`Notes - Updated: ${noteStats.updated}`);
    console.log(`Notes - Generated: ${noteStats.generated}`);
    console.log(`Notes - Skipped: ${noteStats.skipped}`);
    console.log(`Notes - Failed: ${noteStats.failed}`);
    console.log(`Sections - Scanned: ${sectionStats.scanned}`);
    console.log(`Sections - Updated: ${sectionStats.updated}`);
    console.log(`Sections - Generated: ${sectionStats.generated}`);
    console.log(`Sections - Skipped: ${sectionStats.skipped}`);
    console.log(`Sections - Failed: ${sectionStats.failed}`);
};

run().catch((e) => {
    console.error("Reindex failed:", e);
    process.exitCode = 1;
});
