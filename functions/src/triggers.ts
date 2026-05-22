import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { projectID } from "firebase-functions/params";
import { generateEmbedding } from "./embedding";
import { VECTOR_DIMENSION } from "./vectorConfig";

// デプロイ時の param 評価を避けるため、実行時に初期化する。
const preferredLocations = ["asia-northeast1", "us-central1"];
const modelCandidates = [
    "gemini-3.0-flash",
    "gemini-3.0-pro",
    "gemini-2.5-flash"
];
const MAX_SALIENT_ITEMS = 6;
const MAX_SALIENT_TEXT_LENGTH = 280;

type SalientItemType = "keyword" | "claim";

type SalientItem = {
    text: string;
    type: SalientItemType;
    salienceScore: number;
};

let VertexAIClass: typeof import("@google-cloud/vertexai").VertexAI | null = null;

const getVertexAIClass = async () => {
    if (!VertexAIClass) {
        const mod = await import("@google-cloud/vertexai");
        VertexAIClass = mod.VertexAI;
    }
    return VertexAIClass;
};

const isValidEmbedding = (embedding: number[]): boolean => (
    embedding.length === VECTOR_DIMENSION && embedding.every((value) => typeof value === "number" && Number.isFinite(value))
);

const clampScore = (value: unknown, fallback: number): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
};

const normalizeText = (value: unknown): string => {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, MAX_SALIENT_TEXT_LENGTH);
};

const extractJsonObject = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("```")) {
        const withoutFence = trimmed
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");
        if (withoutFence.trim()) return withoutFence.trim();
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return trimmed.slice(start, end + 1);
    }

    return "";
};

const parseSalientEntries = (
    rawEntries: unknown,
    type: SalientItemType,
    fallbackBaseScore: number
): SalientItem[] => {
    if (!Array.isArray(rawEntries)) return [];
    return rawEntries
        .map((entry, index): SalientItem | null => {
            if (typeof entry === "string") {
                const text = normalizeText(entry);
                if (!text) return null;
                return {
                    text,
                    type,
                    salienceScore: clampScore(fallbackBaseScore - index * 0.05, 0.5)
                };
            }

            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;
            const text = normalizeText(record.text);
            if (!text) return null;
            return {
                text,
                type,
                salienceScore: clampScore(record.score, fallbackBaseScore - index * 0.05)
            };
        })
        .filter((item): item is SalientItem => item !== null);
};

const dedupeAndTrimSalientItems = (items: SalientItem[]): SalientItem[] => {
    const seen = new Set<string>();
    const deduped: SalientItem[] = [];

    const sorted = [...items].sort((a, b) => b.salienceScore - a.salienceScore);
    for (const item of sorted) {
        const key = item.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= MAX_SALIENT_ITEMS) break;
    }

    return deduped;
};

const fallbackSalientItems = (markdown: string): SalientItem[] => {
    const headings = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm))
        .map((m) => normalizeText(m[1]));
    const lines = markdown
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter((line) => line.length >= 12 && !line.startsWith("#"))
        .slice(0, 8);

    const combined = [...headings, ...lines]
        .filter(Boolean)
        .slice(0, MAX_SALIENT_ITEMS)
        .map((text, index): SalientItem => ({
            text,
            type: index < Math.ceil(MAX_SALIENT_ITEMS / 2) ? "keyword" : "claim",
            salienceScore: clampScore(0.8 - index * 0.08, 0.4)
        }));

    return dedupeAndTrimSalientItems(combined);
};

const extractSalientItemsWithGemini = async (markdown: string): Promise<SalientItem[]> => {
    const project = projectID.value();
    const prompt = `
Extract salient signals from the markdown note below.

Return JSON only with this schema:
{
  "keywords": [{"text": "string", "score": 0.0}],
  "claims": [{"text": "string", "score": 0.0}]
}

Rules:
- keywords: short noun phrases, max 3 words each if possible.
- claims: concise statements that capture distinctive ideas.
- score range is 0..1.
- pick specific, distinguishing signals; avoid generic words.
- output 3-6 keywords and 2-5 claims.
- no markdown, no code block fences.

Markdown:
${markdown}
`;

    const VertexAI = await getVertexAIClass();
    let lastError: unknown = null;

    for (const location of preferredLocations) {
        const vertexAI = new VertexAI({ location, project });
        for (const model of modelCandidates) {
            try {
                const generativeModel = vertexAI.getGenerativeModel({ model });
                const result = await generativeModel.generateContent(prompt);
                const response = await result.response;
                const text = response.candidates?.[0].content.parts
                    ?.map((part: any) => (typeof part?.text === "string" ? part.text : ""))
                    .join("\n")
                    .trim() ?? "";
                if (!text) continue;

                const jsonPayload = extractJsonObject(text);
                if (!jsonPayload) continue;

                const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
                const keywordItems = parseSalientEntries(parsed.keywords, "keyword", 0.75);
                const claimItems = parseSalientEntries(parsed.claims, "claim", 0.7);
                const merged = dedupeAndTrimSalientItems([...keywordItems, ...claimItems]);
                if (merged.length > 0) return merged;
            } catch (e: any) {
                lastError = e;
                const message = e?.message || "";
                const isNotFound = message.includes("NOT_FOUND") || message.includes("was not found");
                if (isNotFound) {
                    continue;
                }
                console.warn(`Salient extraction failed on model=${model} location=${location}:`, e);
            }
        }
    }

    if (lastError) {
        console.warn("Gemini salient extraction failed; using fallback.", lastError);
    }
    return fallbackSalientItems(markdown);
};

export const onNoteWritten = onDocumentWritten({
    document: "notes/{noteId}",
    region: "asia-northeast1",
    memory: "512MiB"
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return; // 削除時は処理しない

    const newData = snapshot.after.data();
    const oldData = snapshot.before.data();
    const newMarkdown = newData?.markdown || "";
    const oldMarkdown = oldData?.markdown || "";
    if (!newMarkdown || newMarkdown === oldMarkdown) return;

    // 埋め込みだけが変わった場合の無限ループを防ぐ。
    if (newData?.embedding && !oldData?.embedding) return;

    try {
        const noteEmbeddingPromise = generateEmbedding(newMarkdown, undefined, "RETRIEVAL_DOCUMENT");
        const salientItemsPromise = extractSalientItemsWithGemini(newMarkdown);

        // 見出しを基準にセクションへ分割する。
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
        const salientRef = snapshot.after.ref.collection("salientItems");
        const oldSections = await sectionsRef.get();
        const oldSalient = await salientRef.get();
        const batch = admin.firestore().batch();
        oldSections.docs.forEach((doc) => batch.delete(doc.ref));
        oldSalient.docs.forEach((doc) => batch.delete(doc.ref));

        // セクションごとの埋め込みを生成する。
        const embedPromises = sections.map(async (section, index) => {
            const embedding = await generateEmbedding(`${section.title}\n${section.content}`, section.title, "RETRIEVAL_DOCUMENT");
            return {
                index,
                title: section.title,
                content: section.content,
                embedding: embedding
            };
        });

        const [noteEmbedding, salientItems, embeddingResults] = await Promise.all([
            noteEmbeddingPromise,
            salientItemsPromise,
            Promise.all(embedPromises)
        ]);
        console.log(`Generated ${embeddingResults.length} section embeddings.`);
        embeddingResults.forEach((res) => {
            if (!isValidEmbedding(res.embedding)) {
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

        const salientEmbeddingResults = await Promise.all(
            salientItems.map(async (item, index) => {
                const embedding = await generateEmbedding(item.text, undefined, "RETRIEVAL_DOCUMENT");
                return {
                    index,
                    ...item,
                    embedding
                };
            })
        );

        salientEmbeddingResults.forEach((res) => {
            if (!isValidEmbedding(res.embedding)) return;
            const docRef = salientRef.doc(`item_${res.index}`);
            batch.set(docRef, {
                text: res.text,
                type: res.type,
                salienceScore: res.salienceScore,
                embedding: admin.firestore.FieldValue.vector(res.embedding),
                userId: newData?.userId || "",
                noteId: event.params.noteId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // ノート本体の埋め込みと salient 情報を更新する。
        const noteUpdate: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
            embeddingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            salientKeywords: salientItems.filter((item) => item.type === "keyword").map((item) => item.text),
            salientClaims: salientItems.filter((item) => item.type === "claim").map((item) => item.text),
            salientUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (isValidEmbedding(noteEmbedding)) {
            noteUpdate.embedding = admin.firestore.FieldValue.vector(noteEmbedding);
        }
        batch.set(snapshot.after.ref, noteUpdate, { merge: true });

        await batch.commit();
        console.log(`Generated embeddings for note ${event.params.noteId}, ${sections.length} sections, and ${salientEmbeddingResults.length} salient items.`);
    } catch (e) {
        console.error("Embedding generation failed:", e);
    }
});
