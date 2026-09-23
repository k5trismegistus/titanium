import * as admin from 'firebase-admin';
import { generateEmbedding } from './embedding';
import * as fs from 'fs';
import * as path from 'path';
import { VECTOR_DIMENSION } from './vectorConfig';

const resolveEnvInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const PAGE_SIZE = resolveEnvInt(process.env.SALIENT_BACKFILL_PAGE_SIZE, 100);
const MAX_SALIENT_ITEMS = resolveEnvInt(process.env.SALIENT_BACKFILL_MAX_ITEMS, 6);
const MAX_SALIENT_TEXT_LENGTH = 280;

const forceRegenerate =
  process.argv.includes('--force') || process.env.SALIENT_BACKFILL_FORCE === '1';
const dryRun = process.argv.includes('--dry-run') || process.env.SALIENT_BACKFILL_DRY_RUN === '1';
const uidArg = process.argv.find((arg) => arg.startsWith('--uid='));
const targetUid = uidArg ? uidArg.slice('--uid='.length).trim() : '';

const preferredLocations = ['asia-northeast1', 'us-central1'];
const modelCandidates = ['gemini-3.0-flash', 'gemini-3.0-pro', 'gemini-2.5-flash'];

type SalientItemType = 'keyword' | 'claim';

type SalientItem = {
  text: string;
  type: SalientItemType;
  salienceScore: number;
};

type BackfillStats = {
  scanned: number;
  processed: number;
  updated: number;
  skippedExisting: number;
  skippedNoMarkdown: number;
  skippedNoItems: number;
  failed: number;
  generatedItems: number;
};

let VertexAIClass: typeof import('@google-cloud/vertexai').VertexAI | null = null;

const getVertexAIClass = async () => {
  if (!VertexAIClass) {
    const mod = await import('@google-cloud/vertexai');
    VertexAIClass = mod.VertexAI;
  }
  return VertexAIClass;
};

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
      // パースできない場合は別の解決方法へ進む。
    }
  }

  const candidates = [
    path.resolve(__dirname, '..', '..', '.firebaserc'),
    path.resolve(__dirname, '..', '..', '..', '.firebaserc'),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const projects = data?.projects ?? {};
      if (typeof projects.default === 'string') return projects.default;
      const ids = Object.values(projects).filter((val) => typeof val === 'string') as string[];
      if (ids.length === 1) return ids[0];
      if (
        process.env.FIREBASE_PROJECT &&
        typeof projects[process.env.FIREBASE_PROJECT] === 'string'
      ) {
        return projects[process.env.FIREBASE_PROJECT];
      }
    } catch {
      // パースできない場合は別の候補を試す。
    }
  }

  return undefined;
};

const projectId = resolveProjectId();
if (!projectId) {
  throw new Error(
    'Missing project ID. Set GCLOUD_PROJECT/FIREBASE_PROJECT_ID or configure .firebaserc.',
  );
}
if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = projectId;
if (!process.env.GCP_PROJECT) process.env.GCP_PROJECT = projectId;

admin.initializeApp({ projectId });
const db = admin.firestore();

const isValidEmbedding = (embedding: number[]): boolean =>
  embedding.length === VECTOR_DIMENSION &&
  embedding.every((value) => typeof value === 'number' && Number.isFinite(value));

const clampScore = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SALIENT_TEXT_LENGTH);
};

const extractJsonObject = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('```')) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (withoutFence.trim()) return withoutFence.trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return '';
};

const parseSalientEntries = (
  rawEntries: unknown,
  type: SalientItemType,
  fallbackBaseScore: number,
): SalientItem[] => {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((entry, index): SalientItem | null => {
      if (typeof entry === 'string') {
        const text = normalizeText(entry);
        if (!text) return null;
        return {
          text,
          type,
          salienceScore: clampScore(fallbackBaseScore - index * 0.05, 0.5),
        };
      }

      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const text = normalizeText(record.text);
      if (!text) return null;
      return {
        text,
        type,
        salienceScore: clampScore(record.score, fallbackBaseScore - index * 0.05),
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
  const headings = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm)).map((m) =>
    normalizeText(m[1]),
  );
  const lines = markdown
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length >= 12 && !line.startsWith('#'))
    .slice(0, 8);

  const combined = [...headings, ...lines]
    .filter(Boolean)
    .slice(0, MAX_SALIENT_ITEMS)
    .map((text, index): SalientItem => ({
      text,
      type: index < Math.ceil(MAX_SALIENT_ITEMS / 2) ? 'keyword' : 'claim',
      salienceScore: clampScore(0.8 - index * 0.08, 0.4),
    }));

  return dedupeAndTrimSalientItems(combined);
};

const extractSalientItemsWithGemini = async (markdown: string): Promise<SalientItem[]> => {
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
    const vertexAI = new VertexAI({ location, project: projectId });
    for (const model of modelCandidates) {
      try {
        const generativeModel = vertexAI.getGenerativeModel({ model });
        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;
        const text =
          response.candidates?.[0].content.parts
            ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .join('\n')
            .trim() ?? '';
        if (!text) continue;

        const jsonPayload = extractJsonObject(text);
        if (!jsonPayload) continue;

        const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
        const keywordItems = parseSalientEntries(parsed.keywords, 'keyword', 0.75);
        const claimItems = parseSalientEntries(parsed.claims, 'claim', 0.7);
        const merged = dedupeAndTrimSalientItems([...keywordItems, ...claimItems]);
        if (merged.length > 0) return merged;
      } catch (e: any) {
        lastError = e;
        const message = e?.message || '';
        const isNotFound = message.includes('NOT_FOUND') || message.includes('was not found');
        if (isNotFound) continue;
        console.warn(`Salient extraction failed on model=${model} location=${location}:`, e);
      }
    }
  }

  if (lastError) {
    console.warn('Gemini salient extraction failed; using fallback.', lastError);
  }
  return fallbackSalientItems(markdown);
};

const shouldSkipByExistingFields = (data: admin.firestore.DocumentData): boolean => {
  if (forceRegenerate) return false;
  const hasUpdatedAt = !!data.salientUpdatedAt;
  const keywords = Array.isArray(data.salientKeywords) ? data.salientKeywords : [];
  const claims = Array.isArray(data.salientClaims) ? data.salientClaims : [];
  return hasUpdatedAt && (keywords.length > 0 || claims.length > 0);
};

const processNote = async (doc: admin.firestore.QueryDocumentSnapshot, stats: BackfillStats) => {
  const data = doc.data();
  if (shouldSkipByExistingFields(data)) {
    stats.skippedExisting += 1;
    return;
  }

  const markdown = typeof data.markdown === 'string' ? data.markdown.trim() : '';
  if (!markdown) {
    stats.skippedNoMarkdown += 1;
    return;
  }

  stats.processed += 1;
  const salientItems = await extractSalientItemsWithGemini(markdown);
  if (salientItems.length === 0) {
    stats.skippedNoItems += 1;
    return;
  }

  const salientRef = doc.ref.collection('salientItems');
  const oldSalient = await salientRef.get();

  const embeddedItems = await Promise.all(
    salientItems.map(async (item) => {
      const embedding = await generateEmbedding(item.text, undefined, 'RETRIEVAL_DOCUMENT');
      if (!isValidEmbedding(embedding)) return null;
      return { ...item, embedding };
    }),
  );
  const validItems = embeddedItems.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  if (validItems.length === 0) {
    stats.skippedNoItems += 1;
    return;
  }

  if (dryRun) {
    stats.updated += 1;
    stats.generatedItems += validItems.length;
    return;
  }

  const batch = db.batch();
  oldSalient.docs.forEach((oldDoc) => batch.delete(oldDoc.ref));

  validItems.forEach((item, index) => {
    batch.set(salientRef.doc(`item_${index}`), {
      text: item.text,
      type: item.type,
      salienceScore: item.salienceScore,
      embedding: admin.firestore.FieldValue.vector(item.embedding),
      userId: typeof data.userId === 'string' ? data.userId : '',
      noteId: doc.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  batch.set(
    doc.ref,
    {
      salientKeywords: validItems
        .filter((item) => item.type === 'keyword')
        .map((item) => item.text),
      salientClaims: validItems.filter((item) => item.type === 'claim').map((item) => item.text),
      salientUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  stats.updated += 1;
  stats.generatedItems += validItems.length;
};

const run = async () => {
  console.log('Starting salient backfill...');
  console.log(`projectId=${projectId}`);
  console.log(
    `pageSize=${PAGE_SIZE} maxItems=${MAX_SALIENT_ITEMS} force=${forceRegenerate} dryRun=${dryRun} targetUid=${targetUid || 'all'}`,
  );

  const stats: BackfillStats = {
    scanned: 0,
    processed: 0,
    updated: 0,
    skippedExisting: 0,
    skippedNoMarkdown: 0,
    skippedNoItems: 0,
    failed: 0,
    generatedItems: 0,
  };

  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query: admin.firestore.Query = db.collection('notes');
    if (targetUid) {
      query = query.where('userId', '==', targetUid);
    }
    query = query.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      stats.scanned += 1;
      try {
        await processNote(doc, stats);
      } catch (e) {
        stats.failed += 1;
        console.error(`Failed processing note ${doc.id}:`, e);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(
      `Progress scanned=${stats.scanned} updated=${stats.updated} failed=${stats.failed}`,
    );
  }

  console.log('Salient backfill complete.');
  console.log(`Scanned: ${stats.scanned}`);
  console.log(`Processed: ${stats.processed}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Generated Items: ${stats.generatedItems}`);
  console.log(`Skipped Existing: ${stats.skippedExisting}`);
  console.log(`Skipped No Markdown: ${stats.skippedNoMarkdown}`);
  console.log(`Skipped No Items: ${stats.skippedNoItems}`);
  console.log(`Failed: ${stats.failed}`);
};

run().catch((e) => {
  console.error('Salient backfill failed:', e);
  process.exitCode = 1;
});
