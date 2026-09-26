import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateContent } from './generation';
import { buildGroundingReport } from './groundingReport';

type ArticleKind = 'review' | 'articleFactCheck' | 'relatedMaterial' | 'openings';
type ArticleBlock = {
  id: string;
  type: 'heading' | 'paragraph';
  text: string;
  level?: number;
};
type ArticleRequest = {
  kind: ArticleKind;
  noteMarkdown: string;
  blocks: ArticleBlock[];
  sourceNoteIds?: string[];
};
type ArticleSuggestion = {
  targetBlockId: string;
  action: 'replace' | 'remove' | 'insertBefore' | 'insertAfter';
  label: string;
  reason: string;
  replacementMarkdown: string;
  sourceNoteId?: string;
  sourceExcerpt?: string;
};

const MAX_ARTICLE_LENGTH = 60_000;
const MAX_BLOCKS = 200;
const MAX_SOURCE_NOTES = 5;

const SUGGESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          targetBlockId: { type: 'STRING' },
          action: {
            type: 'STRING',
            enum: ['replace', 'remove', 'insertAfter'],
          },
          label: { type: 'STRING' },
          reason: { type: 'STRING' },
          replacementMarkdown: { type: 'STRING' },
          sourceNoteId: { type: 'STRING' },
          sourceExcerpt: { type: 'STRING' },
        },
        required: [
          'targetBlockId',
          'action',
          'label',
          'reason',
          'replacementMarkdown',
          'sourceNoteId',
          'sourceExcerpt',
        ],
      },
    },
  },
  required: ['suggestions'],
};

const OPENINGS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    titleReason: { type: 'STRING' },
    opening: { type: 'STRING' },
    openingReason: { type: 'STRING' },
    ending: { type: 'STRING' },
    endingReason: { type: 'STRING' },
  },
  required: ['title', 'titleReason', 'opening', 'openingReason', 'ending', 'endingReason'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const parseResponse = (text: string | undefined): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(text ?? '');
    if (isRecord(parsed)) return parsed;
  } catch {
    // A malformed response is handled as a failed job, never as an edit.
  }
  throw new Error('Invalid structured AI response.');
};

const validateBlocks = (value: unknown): ArticleBlock[] => {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) {
    throw new HttpsError('invalid-argument', 'Invalid article blocks.');
  }
  const blocks: ArticleBlock[] = [];
  const ids = new Set<string>();
  let totalLength = 0;
  for (const entry of value) {
    if (!isRecord(entry)) throw new HttpsError('invalid-argument', 'Invalid article block.');
    const id = entry.id;
    const text = entry.text;
    const type = entry.type;
    const level = entry.level;
    if (
      typeof id !== 'string' ||
      !/^block-\d+$/.test(id) ||
      ids.has(id) ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 10_000 ||
      (type !== 'heading' && type !== 'paragraph') ||
      (level !== undefined && (type !== 'heading' || ![1, 2, 3].includes(Number(level))))
    ) {
      throw new HttpsError('invalid-argument', 'Invalid article block.');
    }
    ids.add(id);
    totalLength += text.length;
    blocks.push({ id, text, type, ...(level === undefined ? {} : { level: Number(level) }) });
  }
  if (totalLength > MAX_ARTICLE_LENGTH) {
    throw new HttpsError('invalid-argument', 'Article blocks are too long.');
  }
  return blocks;
};

const cleanSuggestions = (
  value: unknown,
  kind: 'review' | 'relatedMaterial',
  blocks: ArticleBlock[],
  sourceNotes: Map<string, string>,
): ArticleSuggestion[] => {
  if (!Array.isArray(value)) return [];
  const blockIds = new Set(blocks.map((block) => block.id));
  const suggestions: ArticleSuggestion[] = [];
  for (const item of value.slice(0, 6)) {
    if (!isRecord(item)) continue;
    const targetBlockId = asString(item.targetBlockId, 40);
    const action = item.action;
    const label = asString(item.label, 80);
    const reason = asString(item.reason, 600);
    const replacementMarkdown = asString(item.replacementMarkdown, 2_500);
    const sourceNoteId = asString(item.sourceNoteId, 1_500);
    const sourceExcerpt = asString(item.sourceExcerpt, 400);
    if (!blockIds.has(targetBlockId) || !label || !reason) continue;
    if (kind === 'review') {
      if (action !== 'replace' && action !== 'remove') continue;
      if (action === 'replace' && !replacementMarkdown) continue;
      suggestions.push({
        targetBlockId,
        action,
        label,
        reason,
        replacementMarkdown: action === 'remove' ? '' : replacementMarkdown,
      });
    } else {
      if (action !== 'insertAfter' || !replacementMarkdown) continue;
      const source = sourceNotes.get(sourceNoteId);
      if (!source || sourceExcerpt.length < 6 || !source.includes(sourceExcerpt)) continue;
      suggestions.push({
        targetBlockId,
        action,
        label,
        reason,
        replacementMarkdown,
        sourceNoteId,
        sourceExcerpt,
      });
    }
    if (suggestions.length >= (kind === 'review' ? 4 : 3)) break;
  }
  return suggestions;
};

const makeOpeningSuggestions = (
  value: Record<string, unknown>,
  blocks: ArticleBlock[],
): ArticleSuggestion[] => {
  const first = blocks[0];
  const firstParagraph = blocks.find((block) => block.type === 'paragraph');
  const last = blocks.at(-1);
  if (!first || !last) return [];
  const suggestions: ArticleSuggestion[] = [];
  const title = asString(value.title, 180).replace(/^#+\s*/, '');
  if (title) {
    const titleBlock = first.type === 'heading' && first.level === 1 ? first : null;
    suggestions.push({
      targetBlockId: titleBlock?.id ?? first.id,
      action: titleBlock ? 'replace' : 'insertBefore',
      label: 'Title',
      reason: asString(value.titleReason, 500) || 'A possible title for this draft.',
      replacementMarkdown: `# ${title}`,
    });
  }
  const opening = asString(value.opening, 2_000);
  if (opening) {
    suggestions.push({
      targetBlockId: firstParagraph?.id ?? first.id,
      action: firstParagraph ? 'insertBefore' : 'insertAfter',
      label: 'Opening',
      reason: asString(value.openingReason, 500) || 'An opening for this draft.',
      replacementMarkdown: opening,
    });
  }
  const ending = asString(value.ending, 2_000);
  if (ending) {
    suggestions.push({
      targetBlockId: last.id,
      action: 'insertAfter',
      label: 'Ending',
      reason: asString(value.endingReason, 500) || 'A closing thought for this draft.',
      replacementMarkdown: ending,
    });
  }
  return suggestions;
};

export const articleAssist = onCall<ArticleRequest>(
  { region: 'asia-northeast1', memory: '1GiB', timeoutSeconds: 180 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');
    const uid = request.auth.uid;
    const user = await admin.firestore().collection('allowedUsers').doc(uid).get();
    if (!user.exists || user.data()?.allowed !== true) {
      throw new HttpsError('permission-denied', 'User is not in the whitelist.');
    }

    const { kind, noteMarkdown, sourceNoteIds } = request.data ?? {};
    if (
      !['review', 'articleFactCheck', 'relatedMaterial', 'openings'].includes(kind) ||
      typeof noteMarkdown !== 'string' ||
      !noteMarkdown.trim() ||
      noteMarkdown.length > MAX_ARTICLE_LENGTH
    ) {
      throw new HttpsError('invalid-argument', 'Invalid article or request kind.');
    }
    const blocks = validateBlocks(request.data?.blocks);
    if (kind !== 'articleFactCheck' && blocks.length === 0) {
      throw new HttpsError('invalid-argument', 'No editable article paragraphs found.');
    }

    try {
      if (kind === 'articleFactCheck') {
        const response = await generateContent(
          `Fact-check the checkable claims in this entire draft using public web sources. Skip opinions, personal experiences, and creative language. Give a concise report in the draft's language, organized by claim. For each claim, state whether evidence supports it, contradicts it, or is insufficient. Include dates and uncertainty where relevant. Do not invent citations or treat the draft itself as evidence.\n\nDraft:\n${noteMarkdown}`,
          { googleSearch: true },
        );
        return { kind, ...buildGroundingReport(response) };
      }

      if (kind === 'openings') {
        const response = await generateContent(
          `You are helping the author polish a blog draft. Propose one concise title, one opening paragraph, and one ending paragraph. Preserve the draft's language, voice, and facts. The opening should lead into the existing first paragraph without repeating it. The ending should follow the existing last point without repeating it. Do not introduce external facts. Give a short reason for each proposal. Return only the required JSON fields.\n\nDraft:\n${noteMarkdown}`,
          { responseSchema: OPENINGS_SCHEMA },
        );
        return {
          kind,
          suggestions: makeOpeningSuggestions(parseResponse(response.text), blocks),
        };
      }

      const sourceNotes = new Map<string, string>();
      if (kind === 'relatedMaterial') {
        if (
          !Array.isArray(sourceNoteIds) ||
          sourceNoteIds.length > MAX_SOURCE_NOTES ||
          sourceNoteIds.some((id) => typeof id !== 'string' || !id || id.length > 1_500)
        ) {
          throw new HttpsError('invalid-argument', 'Invalid related note IDs.');
        }
        const snapshots = await Promise.all(
          [...new Set(sourceNoteIds)].map((id) =>
            admin.firestore().collection('notes').doc(id).get(),
          ),
        );
        for (const snap of snapshots) {
          const data = snap.data();
          if (data?.userId !== uid || typeof data.markdown !== 'string') continue;
          sourceNotes.set(snap.id, data.markdown.slice(0, 3_000));
        }
        if (sourceNotes.size === 0) return { kind, suggestions: [] };
      }

      const blockList = JSON.stringify(blocks);
      const sourceList = JSON.stringify(
        [...sourceNotes].map(([id, markdown]) => ({ id, markdown })),
      );
      const task =
        kind === 'review'
          ? `Review this blog draft as a careful reader. Suggest at most four high-value changes to a specific top-level paragraph or heading: clarify a confusing passage, shorten repetition, or remove a genuinely off-topic paragraph. Only suggest removal when the main argument remains intact. A personal aside can be intentional; leave it alone if unsure. For each suggestion use a block ID from the list, action "replace" or "remove", a short label and reason in the draft's language, and replacement Markdown for "replace". For "remove", use an empty replacementMarkdown. Do not make cosmetic rewrites. Return an empty suggestions array if nothing clearly helps. Set sourceNoteId and sourceExcerpt to empty strings.`
          : `Use only the supplied past notes to suggest up to three concrete additions that would deepen this blog draft. Each suggestion must use action "insertAfter" with the block ID where it fits, a short label and reason in the draft's language, and a brief replacementMarkdown passage in the draft's voice. Include the exact source note ID and an exact 6-400 character excerpt copied from that source note in sourceExcerpt. Do not invent personal experiences or facts. Return an empty suggestions array if the notes add nothing useful.`;
      const response = await generateContent(
        `${task}\n\nCurrent draft:\n${noteMarkdown}\n\nEditable top-level blocks (IDs are temporary):\n${blockList}\n\nPast notes:\n${sourceList}`,
        { responseSchema: SUGGESTIONS_SCHEMA },
      );
      const parsed = parseResponse(response.text);
      return {
        kind,
        suggestions: cleanSuggestions(parsed.suggestions, kind, blocks, sourceNotes),
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Article assist failed:', error);
      throw new HttpsError('internal', 'Article AI request failed.');
    }
  },
);
