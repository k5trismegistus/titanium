import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateContent, generateText } from './generation';

type AssistRequest = {
  kind: 'factCheck' | 'expandOutline';
  selectedText: string;
  noteMarkdown: string;
};

const MAX_SELECTED_LENGTH = 12_000;
const MAX_NOTE_LENGTH = 100_000;

export const editorAssist = onCall<AssistRequest>(
  { region: 'asia-northeast1', memory: '1GiB', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in.');
    }
    const user = await admin.firestore().collection('allowedUsers').doc(request.auth.uid).get();
    if (!user.exists || user.data()?.allowed !== true) {
      throw new HttpsError('permission-denied', 'User is not in the whitelist.');
    }

    const { kind, selectedText, noteMarkdown } = request.data ?? {};
    if (
      (kind !== 'factCheck' && kind !== 'expandOutline') ||
      typeof selectedText !== 'string' ||
      !selectedText.trim() ||
      selectedText.length > MAX_SELECTED_LENGTH ||
      typeof noteMarkdown !== 'string' ||
      noteMarkdown.length > MAX_NOTE_LENGTH
    ) {
      throw new HttpsError('invalid-argument', 'Invalid editor selection or note length.');
    }

    try {
      if (kind === 'expandOutline') {
        const replacementMarkdown =
          await generateText(`You are an editor. Expand only the selected outline into finished prose.
Use the whole note for context, preserve its language, viewpoint, facts, and tone.
Do not invent external facts. Return only replacement Markdown, without a preface or code fence.

Whole note (context only):\n${noteMarkdown}\n\nSelected outline (replace this only):\n${selectedText}`);
        if (!replacementMarkdown) throw new Error('Empty expansion');
        return { kind, replacementMarkdown };
      }

      const response = await generateContent(
        `Fact-check the selected passage using public web sources. Search for evidence for each checkable claim.
Write a concise report in the language of the selected passage. For each claim, say whether the evidence supports it, contradicts it, or is insufficient. State dates and uncertainty where relevant. Do not invent citations, links, or sources. Do not treat the note itself as evidence.

Whole note (context only):\n${noteMarkdown}\n\nPassage to verify:\n${selectedText}`,
        { googleSearch: true },
      );
      const report = response.text?.trim() ?? '';
      const metadata = response.candidates?.[0]?.groundingMetadata;
      const sources = (metadata?.groundingChunks ?? [])
        .map((chunk, index) => ({
          index,
          title: chunk.web?.title ?? '',
          url: chunk.web?.uri ?? '',
        }))
        .filter((source) => /^https?:\/\//i.test(source.url));
      const supports = (metadata?.groundingSupports ?? [])
        .map((support) => ({
          text: support.segment?.text ?? '',
          sourceIndices: (support.groundingChunkIndices ?? []).filter((index) =>
            sources.some((source) => source.index === index),
          ),
        }))
        .filter(
          (support) =>
            support.text && report.includes(support.text) && support.sourceIndices.length > 0,
        );
      const grounded = Boolean(report) && sources.length > 0 && supports.length > 0;
      return {
        kind,
        grounded,
        report: grounded && report ? report : '',
        sources: grounded ? sources : [],
        supports: grounded ? supports : [],
        searchSuggestionsHtml: metadata?.searchEntryPoint?.renderedContent ?? '',
      };
    } catch (error) {
      console.error('Editor assist failed:', error);
      throw new HttpsError('internal', 'AI request failed.');
    }
  },
);
