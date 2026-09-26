import type { GenerateContentResponse } from '@google/genai';

export const buildGroundingReport = (response: GenerateContentResponse) => {
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
    grounded,
    report: grounded ? report : '',
    sources: grounded ? sources : [],
    supports: grounded ? supports : [],
    searchSuggestionsHtml: metadata?.searchEntryPoint?.renderedContent ?? '',
  };
};
