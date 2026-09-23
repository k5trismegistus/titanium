import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export interface MixRequest {
    noteIds: string[];
    sectionIds?: string[];
    stylePrompt?: string;
    category?: string;
    baseNoteId?: string;
}

export interface MixResponse {
    markdown: string;
}

export const callMix = (data: MixRequest) =>
    httpsCallable<MixRequest, { markdown: string }>(functions, 'mix')(data);

export type EditorAssistRequest = {
    kind: 'factCheck' | 'expandOutline';
    selectedText: string;
    noteMarkdown: string;
};

export type FactCheckResponse = {
    kind: 'factCheck';
    grounded: boolean;
    report: string;
    sources: Array<{ index: number; title: string; url: string }>;
    supports: Array<{ text: string; sourceIndices: number[] }>;
    searchSuggestionsHtml: string;
};

export type ExpandOutlineResponse = {
    kind: 'expandOutline';
    replacementMarkdown: string;
};

export const callEditorAssist = (data: EditorAssistRequest) =>
    httpsCallable<EditorAssistRequest, FactCheckResponse | ExpandOutlineResponse>(
        functions,
        'editorAssist',
    )(data);

export const searchRelated = (data: { noteId: string; limit?: number; queryText?: string }) =>
    httpsCallable<{ noteId: string; limit?: number; queryText?: string }, { results: any[] }>(
        functions,
        'searchRelated',
    )(data);
export const updateEmbedding = httpsCallable<{ noteId: string }, void>(
    functions,
    'updateEmbedding',
);

export const searchNotes = (data: { queryText: string; limit?: number }) =>
    httpsCallable<{ queryText: string; limit?: number }, { results: any[] }>(
        functions,
        'searchNotes',
    )(data);

export const callQuickWord = (data: { word: string; category?: string }) =>
    httpsCallable<{ word: string; category?: string }, { noteId: string; markdown: string }>(
        functions,
        'quickWord',
    )(data);

export const ensureAllowedUser = () =>
    httpsCallable<void, { created: boolean }>(functions, 'ensureAllowedUser')();
