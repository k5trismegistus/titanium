import type { Editor } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import Paragraph from '@tiptap/extension-paragraph';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import type { MarkdownStorage } from 'tiptap-markdown';

const BLANK_LINE_TOKEN_PREFIX = "[[titanium-blank-line:";
const BLANK_LINE_TOKEN_SUFFIX = "]]";
const BLANK_LINE_TOKEN_REGEX = /^\[\[titanium-blank-line:(\d+)\]\]$/;

export const TitaniumParagraph = Paragraph.extend({
    addAttributes() {
        return {
            blankLineCount: {
                default: 0,
                parseHTML: (element: HTMLElement) => {
                    const value = element.getAttribute("data-blank-line-count");
                    if (!value) return 0;
                    const parsed = Number.parseInt(value, 10);
                    return Number.isFinite(parsed) ? parsed : 0;
                },
                renderHTML: (attributes: { blankLineCount?: number }) => {
                    const blankLineCount = attributes.blankLineCount ?? 0;
                    if (blankLineCount <= 0) {
                        return {};
                    }

                    return {
                        "data-blank-line": "true",
                        "data-blank-line-count": String(blankLineCount)
                    };
                }
            },
            blankLineDisplayCount: {
                default: 0,
                parseHTML: (element: HTMLElement) => {
                    const value = element.getAttribute("data-blank-line-display-count");
                    if (!value) return 0;
                    const parsed = Number.parseInt(value, 10);
                    return Number.isFinite(parsed) ? parsed : 0;
                },
                renderHTML: (attributes: { blankLineCount?: number; blankLineDisplayCount?: number }) => {
                    const blankLineCount = attributes.blankLineCount ?? 0;
                    const blankLineDisplayCount = attributes.blankLineDisplayCount ?? 0;
                    if (blankLineCount <= 0 || blankLineDisplayCount <= 0) {
                        return {};
                    }

                    return {
                        "data-blank-line-display-count": String(blankLineDisplayCount),
                        style: `--blank-line-count:${blankLineDisplayCount};`
                    };
                }
            }
        };
    },
    addStorage() {
        return {
            markdown: {
                serialize: (
                    state: MarkdownSerializerState,
                    node: ProseMirrorNode,
                    parent: ProseMirrorNode,
                    index: number
                ) => {
                    const blankLineCount = typeof node.attrs.blankLineCount === "number" ? node.attrs.blankLineCount : 0;
                    if (blankLineCount > 0 && node.textContent.length === 0) {
                        const serializerState = state as MarkdownSerializerState & { flushClose: (size?: number) => void };
                        if (index === 0) {
                            serializerState.write("\n".repeat(blankLineCount));
                            return;
                        }

                        serializerState.flushClose(blankLineCount);
                        return;
                    }

                    defaultMarkdownSerializer.nodes.paragraph(state, node, parent, index);
                },
                parse: {
                    updateDOM: (element: Element) => {
                        element.querySelectorAll("p").forEach((paragraph) => {
                            const text = paragraph.textContent?.trim() ?? "";
                            const match = text.match(BLANK_LINE_TOKEN_REGEX);
                            if (!match) {
                                return;
                            }

                            paragraph.textContent = "";
                            paragraph.setAttribute("data-blank-line", "true");
                            paragraph.setAttribute("data-blank-line-count", match[1]);
                            const hasPreviousBlock = Boolean(paragraph.previousElementSibling);
                            const hasNextBlock = Boolean(paragraph.nextElementSibling);
                            const blankLineCount = Number.parseInt(match[1], 10);
                            const displayCount = hasPreviousBlock && hasNextBlock
                                ? Math.max(blankLineCount - 1, 1)
                                : blankLineCount;

                            paragraph.setAttribute("data-blank-line-display-count", String(displayCount));
                            paragraph.setAttribute("style", `--blank-line-count:${displayCount};`);
                        });
                    }
                }
            }
        };
    }
});

export const TitaniumHardBreak = HardBreak.extend({
    addStorage() {
        return {
            markdown: {
                serialize: (state: MarkdownSerializerState, node: ProseMirrorNode, parent: ProseMirrorNode, index: number) => {
                    for (let i = index + 1; i < parent.childCount; i += 1) {
                        if (parent.child(i).type !== node.type) {
                            state.write("\n");
                            return;
                        }
                    }
                },
                parse: {
                    // markdown-it 側で処理する。
                }
            }
        };
    }
});

export const getEditorMarkdown = (editor: Editor) => {
    const storage = editor.storage as { markdown?: MarkdownStorage };
    if (storage.markdown) {
        return storage.markdown.getMarkdown();
    }
    return editor.getText();
};

export const prepareMarkdownForRichEditor = (markdown: string) => {
    if (!markdown) return "";

    return markdown.replace(/\n{2,}/g, (match, offset, input) => {
        const isStart = offset === 0;
        const isEnd = offset + match.length === input.length;
        const token = getBlankLineToken(match.length);

        if (isStart && isEnd) {
            return token;
        }

        if (isStart) {
            return `${token}\n\n`;
        }

        if (isEnd) {
            return `\n\n${token}`;
        }

        return `\n\n${token}\n\n`;
    });
};

const getBlankLineToken = (blankLineCount: number) => `${BLANK_LINE_TOKEN_PREFIX}${blankLineCount}${BLANK_LINE_TOKEN_SUFFIX}`;
