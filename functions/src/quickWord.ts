import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateText } from './generation';

const db = admin.firestore();

interface QuickWordRequest {
  word: string;
  category?: string;
}

export const quickWord = onCall<QuickWordRequest>(
  { region: 'asia-northeast1', memory: '1GiB', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = request.auth.uid;
    const userDoc = await db.collection('allowedUsers').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.allowed !== true) {
      throw new HttpsError('permission-denied', 'User is not in the whitelist.');
    }

    const rawWord = typeof request.data.word === 'string' ? request.data.word.trim() : '';
    if (!rawWord) {
      throw new HttpsError('invalid-argument', 'Word is required.');
    }

    const category =
      typeof request.data.category === 'string' && request.data.category.trim().length > 0
        ? request.data.category.trim()
        : 'Memo';

    try {
      const prompt = `
        You are a concise encyclopedia editor.

        Task: Write a short, clear explainer article about the term below.
        Term: ${rawWord}

        Instructions:
        - Detect the language from the term and write ONLY in that language.
        - Use Markdown with a title (# Term) and 2-4 short sections.
        - Keep it practical and easy to scan (short paragraphs or bullet points).
        - Do not use Markdown emphasis such as **, __, *, or _ for emphasis.
        - Do not include AI disclaimers or meta commentary.

        Output:
        Return only the Markdown content.
      `;

      const text = await generateText(prompt);
      if (!text) throw new Error('Empty quick word response.');

      const noteRef = await db.collection('notes').add({
        userId: uid,
        markdown: text,
        category,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { noteId: noteRef.id, markdown: text };
    } catch (e: any) {
      console.error('Quick Word Error:', e);
      throw new HttpsError('internal', 'Failed to generate quick word content: ' + e.message);
    }
  },
);
