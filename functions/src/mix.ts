import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";
import { projectID } from "firebase-functions/params";

const db = admin.firestore();

// Initialize at runtime
const location = "asia-northeast1";

interface MixRequest {
  noteIds: string[];
  stylePrompt?: string;
  category?: string;
}

export const mix = onCall<MixRequest>({ region: "asia-northeast1", memory: "1GiB", timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const uid = request.auth.uid;

  // 1. Security: Whitelist Check
  const userDoc = await db.collection("allowedUsers").doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.allowed !== true) {
    throw new HttpsError("permission-denied", "User is not in the whitelist.");
  }

  const { noteIds, stylePrompt, category } = request.data;
  if (!noteIds || noteIds.length === 0) {
    throw new HttpsError("invalid-argument", "At least one note ID is required to mix.");
  }

  // 2. Fetch Content
  let notesData: { id: string; markdown: string }[] = [];

  const docs = await Promise.all(
    noteIds.map(id => db.collection("notes").doc(id).get())
  );

  docs.forEach(docSnap => {
    if (docSnap.exists && docSnap.data()?.userId === uid) {
      const content = docSnap.data()?.markdown;
      if (content) {
        notesData.push({ id: docSnap.id, markdown: content });
      }
    }
  });

  if (notesData.length === 0) {
    return { markdown: "" };
  }

  // 3. Vertex AI Logic (using @google-cloud/vertexai)
  try {
    const vertexAI = new VertexAI({ location, project: projectID.value() });
    const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-1.5-pro-002" });

    const prompt = `
      You are an expert editor and writer.
      
      Task: Create a new cohesive document based on the following notes.
      Target Audience/Format: ${category || "General Note / Memo"}
      
      Instructions:
      - Synthesize the information. Do not just list it.
      - Use the "Target Audience/Format" to decide the tone and structure. 
        (e.g. if 'Qiita': technical, code-focused. if 'Blog': engaging, personal. if 'Memo': concise, bullet points.)
      - If there are conflicts, mention them.
      - Output in Markdown.

      Source Notes:
      ${notesData.map(n => `--- Note: ${n.id} ---\n${n.markdown}`).join("\n\n")}
      
      **Goal**: Create a new insight, summary, or article that bridges the concepts found in the input notes.
      **Style**: Professional, clear, and insightful.
      **Language**: The output MUST be in the dominant language of the inputs.
      ${stylePrompt ? `**User Direction**: ${stylePrompt}` : ""}
      
      **Output**:
      Generate the new content in Markdown format. Do not include introductory filler.
    `;

    const result = await generativeModel.generateContent(prompt);

    // Fix: Access response correctly via result.response.candidates
    const response = await result.response;
    const text = response.candidates?.[0].content.parts[0].text || "";

    return { markdown: text };
  } catch (e: any) {
    console.error("Vertex AI Mix Error:", e);
    throw new HttpsError("internal", "Failed to generate mixed content: " + e.message);
  }
});
