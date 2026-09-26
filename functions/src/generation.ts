import {
  GoogleGenAI,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';
import { projectID } from 'firebase-functions/params';

export const GENERATION_MODEL = 'gemini-3.8-flash';
export const GENERATION_LOCATION = 'global';

let client: GoogleGenAI | null = null;
let cachedProject = '';

const getClient = (projectOverride?: string) => {
  const project = projectOverride || projectID.value();
  if (!client || cachedProject !== project) {
    client = new GoogleGenAI({
      vertexai: true,
      project,
      location: GENERATION_LOCATION,
    });
    cachedProject = project;
  }
  return client;
};

export const generateContent = async (
  prompt: string,
  options: { googleSearch?: boolean; project?: string; responseSchema?: unknown } = {},
): Promise<GenerateContentResponse> => {
  const config: GenerateContentConfig = {};
  if (options.googleSearch) config.tools = [{ googleSearch: {} }];
  if (options.responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = options.responseSchema;
  }
  return getClient(options.project).models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
    config,
  });
};

export const generateText = async (prompt: string, project?: string): Promise<string> => {
  const response = await generateContent(prompt, { project });
  return response.text?.trim() ?? '';
};
