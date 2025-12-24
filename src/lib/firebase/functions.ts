import { httpsCallable } from "firebase/functions";
import { functions } from "./config";

export interface MixRequest {
    noteIds: string[];
    sectionIds?: string[];
    stylePrompt?: string;
    category?: string;
}

export interface MixResponse {
    markdown: string;
}

export const callMix = (data: MixRequest) => httpsCallable<MixRequest, { markdown: string }>(functions, 'mix')(data);

export const searchRelated = (data: { noteId: string; limit?: number; queryText?: string }) =>
    httpsCallable<{ noteId: string; limit?: number; queryText?: string }, { results: any[] }>(functions, 'searchRelated')(data);
export const updateEmbedding = httpsCallable<{ noteId: string }, void>(functions, 'updateEmbedding');
