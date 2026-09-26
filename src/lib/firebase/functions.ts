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

export type ArticleAssistKind = 'review' | 'articleFactCheck' | 'relatedMaterial' | 'openings';

export type ArticleBlockInput = {
    id: string;
    type: 'heading' | 'paragraph';
    text: string;
    level?: number;
};

export type ArticleAssistRequest = {
    kind: ArticleAssistKind;
    noteMarkdown: string;
    blocks: ArticleBlockInput[];
    sourceNoteIds?: string[];
};

export type ArticleSuggestion = {
    targetBlockId: string;
    action: 'replace' | 'remove' | 'insertBefore' | 'insertAfter';
    label: string;
    reason: string;
    replacementMarkdown: string;
    sourceNoteId?: string;
    sourceExcerpt?: string;
};

export type ArticleSuggestionsResponse = {
    kind: 'review' | 'relatedMaterial' | 'openings';
    suggestions: ArticleSuggestion[];
};

export type ArticleFactCheckResponse = Omit<FactCheckResponse, 'kind'> & {
    kind: 'articleFactCheck';
};

export const callArticleAssist = (data: ArticleAssistRequest) =>
    httpsCallable<ArticleAssistRequest, ArticleSuggestionsResponse | ArticleFactCheckResponse>(
        functions,
        'articleAssist',
        { timeout: 190_000 },
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
