import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { projectID } from 'firebase-functions/params';

const db = admin.firestore();

// Initialize at runtime
const preferredLocations = ['asia-northeast1', 'us-central1'];
const modelCandidates = ['gemini-3.0-flash', 'gemini-3.0-pro', 'gemini-2.5-flash'];
let VertexAIClass: typeof import('@google-cloud/vertexai').VertexAI | null = null;

const getVertexAIClass = async () => {
  if (!VertexAIClass) {
    const mod = await import('@google-cloud/vertexai');
    VertexAIClass = mod.VertexAI;
  }
  return VertexAIClass;
};

interface MixRequest {
  noteIds: string[];
  stylePrompt?: string;
  category?: string;
  baseNoteId?: string;
}

export const mix = onCall<MixRequest>(
  { region: 'asia-northeast1', memory: '1GiB', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = request.auth.uid;

    // 1. Security: Whitelist Check
    const userDoc = await db.collection('allowedUsers').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.allowed !== true) {
      throw new HttpsError('permission-denied', 'User is not in the whitelist.');
    }

    const { noteIds, stylePrompt, category, baseNoteId } = request.data;
    if (!noteIds || noteIds.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one note ID is required to mix.');
    }

    // 2. Fetch Content
    const notesData: { id: string; markdown: string }[] = [];

    const docs = await Promise.all(noteIds.map((id) => db.collection('notes').doc(id).get()));

    docs.forEach((docSnap) => {
      if (docSnap.exists && docSnap.data()?.userId === uid) {
        const content = docSnap.data()?.markdown;
        if (content) {
          notesData.push({ id: docSnap.id, markdown: content });
        }
      }
    });

    if (notesData.length === 0) {
      return { markdown: '' };
    }

    const primaryNote =
      (baseNoteId ? notesData.find((note) => note.id === baseNoteId) : undefined) || notesData[0];

    // 3. Vertex AI Logic (using @google-cloud/vertexai)
    try {
      const project = projectID.value();
      let text = '';
      let lastError: any = null;

      const primaryNoteBlock = primaryNote
        ? `--- Primary Note (language anchor): ${primaryNote.id} ---\n${primaryNote.markdown}`
        : '';

      const prompt = `
      You are an expert editor and writer.

      Task: Create a new cohesive document based on the following notes.
      Target Audience/Format: ${category || 'General Note / Memo'}

      Instructions:
      - Create a brand-new note made ONLY of new ideas generated from the inputs.
      - Do NOT summarize, paraphrase, or restate the notes.
      - Do NOT create a chapter-by-chapter recap of the inputs.
      - Force synergy: extract latent signals and combine them into novel concepts that do not appear in any single note.
      - Every section must be a fresh insight, hypothesis, framework, or proposal that could not exist without mixing the notes.
      - Do not mention the source notes or list their points.
      - Use the "Target Audience/Format" to decide the tone and structure.
        (e.g. if 'Qiita': technical, code-focused. if 'Blog': engaging, personal. if 'Memo': concise, bullet points.)
      - If there are conflicts, mention them.
      - Output in Markdown.
      - Do not use Markdown emphasis or decorations such as **, __, *, or _ for emphasis.
      - Language lock: Detect the language of the Primary Note and write ONLY in that language. Never switch languages.

      ${primaryNoteBlock}

      Source Notes:
      ${notesData.map((n) => `--- Note: ${n.id} ---\n${n.markdown}`).join('\n\n')}

      Goal: Create a new insight or article that bridges and recombines the concepts found in the input notes.
      Style: Professional, clear, and insightful.
      Language: Strictly match the Primary Note's language. Do not include translations or bilingual output.
      ${stylePrompt ? `User Direction: ${stylePrompt}` : ''}

      Output:
      Generate the new content in Markdown format. Do not include introductory filler.
    `;

      const VertexAI = await getVertexAIClass();
      for (const location of preferredLocations) {
        const vertexAI = new VertexAI({ location, project });
        for (const model of modelCandidates) {
          try {
            const generativeModel = vertexAI.getGenerativeModel({ model });
            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;
            text = response.candidates?.[0].content.parts[0].text || '';
            if (text) break;
          } catch (e: any) {
            lastError = e;
            const message = e?.message || '';
            const isNotFound = message.includes('NOT_FOUND') || message.includes('was not found');
            if (!isNotFound) {
              throw e;
            }
          }
        }
        if (text) break;
      }

      if (!text) {
        throw lastError || new Error('No available Gemini model found.');
      }

      return { markdown: text };
    } catch (e: any) {
      console.error('Vertex AI Mix Error:', e);
      throw new HttpsError('internal', 'Failed to generate mixed content: ' + e.message);
    }
  },
);
