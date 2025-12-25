import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
// VertexAI import removed as it is not used here anymore if we use helper
import { generateEmbedding } from "./embedding";

// Initialize at runtime to avoid param access during deployment

export const onNoteWritten = onDocumentWritten({
    document: "notes/{noteId}",
    region: "asia-northeast1",
    memory: "512MiB"
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return; // Deletion

    const newData = snapshot.after.data();
    const oldData = snapshot.before.data();
    const newMarkdown = newData?.markdown || "";
    const oldMarkdown = oldData?.markdown || "";
    if (!newMarkdown || newMarkdown === oldMarkdown) return;

    // Prevent infinite loop when only embedding changed
    if (newData?.embedding && !oldData?.embedding) return;

    try {
        // Whole‑note embedding
        const noteEmbedding = await generateEmbedding(newMarkdown, undefined, "RETRIEVAL_DOCUMENT");

        // Split into sections
        const sectionRegex = /(^#{1,3}\s+.*$)/gm;
        const parts = newMarkdown.split(sectionRegex);
        console.log(`Markdown split into ${parts.length} parts.`);

        const sections: { title: string; content: string }[] = [];
        let currentTitle = "Introduction";
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            if (part.startsWith("#")) {
                currentTitle = part.replace(/^#+\s+/, "");
            } else {
                sections.push({ title: currentTitle, content: part });
            }
        }
        console.log(`Parsed ${sections.length} sections from markdown.`);

        const sectionsRef = snapshot.after.ref.collection("sections");
        const oldSections = await sectionsRef.get();
        const batch = admin.firestore().batch();
        oldSections.docs.forEach((doc) => batch.delete(doc.ref));

        // Section embeddings
        const embedPromises = sections.map(async (section, index) => {
            const embedding = await generateEmbedding(`${section.title}\n${section.content}`, section.title, "RETRIEVAL_DOCUMENT");
            return {
                index,
                title: section.title,
                content: section.content,
                embedding: embedding
            };
        });

        const embeddingResults = await Promise.all(embedPromises);
        console.log(`Generated ${embeddingResults.length} section embeddings.`);
        embeddingResults.forEach((res) => {
            if (!res.embedding) {
                console.log(`Section ${res.index} has no embedding`);
                return;
            }
            const docRef = sectionsRef.doc(`section_${res.index}`);
            batch.set(docRef, {
                title: res.title,
                content: res.content,
                embedding: admin.firestore.FieldValue.vector(res.embedding),
                userId: newData?.userId || "",
                noteId: event.params.noteId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Update main note embedding
        batch.set(snapshot.after.ref, {
            embedding: admin.firestore.FieldValue.vector(noteEmbedding),
            embeddingUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        console.log(`Generated embeddings for note ${event.params.noteId} and ${sections.length} sections.`);
    } catch (e) {
        console.error("Embedding generation failed:", e);
    }
});
