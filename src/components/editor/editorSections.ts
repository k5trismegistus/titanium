import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type ActiveSection = {
    text: string;
    heading: string;
};

export const extractSectionAtCursor = (markdown: string, cursorIndex: number) => {
    if (!markdown) {
        return { heading: 'Introduction', content: '' };
    }

    const safeCursor = Math.max(0, Math.min(cursorIndex, markdown.length));
    const headingRegex = /^#{1,3}\s+.*$/gm;
    const matches = Array.from(markdown.matchAll(headingRegex));

    if (matches.length === 0) {
        return { heading: 'Introduction', content: markdown.trim() };
    }

    const firstHeadingIndex = matches[0].index ?? 0;
    if (safeCursor < firstHeadingIndex) {
        const nextStart = firstHeadingIndex;
        return {
            heading: 'Introduction',
            content: markdown.slice(0, nextStart).trim(),
        };
    }

    for (let i = 0; i < matches.length; i += 1) {
        const match = matches[i];
        const start = match.index ?? 0;
        const next = matches[i + 1];
        const nextStart = next?.index ?? markdown.length;

        if (safeCursor >= start && safeCursor < nextStart) {
            const headingLine = match[0];
            const heading = headingLine.replace(/^#+\s+/, '');
            const lineEnd = markdown.indexOf('\n', start);
            const contentStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
            const content = markdown.slice(contentStart, nextStart).trim();
            return { heading, content };
        }
    }

    const lastMatch = matches[matches.length - 1];
    const lastStart = lastMatch.index ?? 0;
    const headingLine = lastMatch[0];
    const heading = headingLine.replace(/^#+\s+/, '');
    const lineEnd = markdown.indexOf('\n', lastStart);
    const contentStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const content = markdown.slice(contentStart).trim();
    return { heading, content };
};

export const updateActiveSectionFromEditor = (
    editor: Editor,
    setActiveSection: (next: ActiveSection) => void,
) => {
    const selectionFrom = editor.state.selection.from;
    const { heading, content } = extractSectionFromDoc(editor.state.doc, selectionFrom);
    const text = [heading, content].filter(Boolean).join('\n');
    setActiveSection({ text, heading });
};

const extractSectionFromDoc = (doc: ProseMirrorNode, selectionFrom: number) => {
    const headings: Array<{ pos: number; end: number; text: string }> = [];

    doc.descendants((node, pos) => {
        if (
            node.type.name === 'heading' &&
            typeof node.attrs.level === 'number' &&
            node.attrs.level <= 3
        ) {
            headings.push({ pos, end: pos + node.nodeSize, text: node.textContent });
        }
    });

    const docEnd = doc.content.size;
    const safeSelection = Math.max(0, Math.min(selectionFrom, docEnd));

    if (headings.length === 0) {
        return { heading: 'Introduction', content: doc.textBetween(0, docEnd, '\n').trim() };
    }

    const firstHeading = headings[0];
    if (safeSelection < firstHeading.pos) {
        return {
            heading: 'Introduction',
            content: doc.textBetween(0, firstHeading.pos, '\n').trim(),
        };
    }

    for (let i = 0; i < headings.length; i += 1) {
        const current = headings[i];
        const next = headings[i + 1];
        const sectionEnd = next ? next.pos : docEnd;
        if (safeSelection >= current.pos && safeSelection < sectionEnd) {
            return {
                heading: current.text || 'Introduction',
                content: doc.textBetween(current.end, sectionEnd, '\n').trim(),
            };
        }
    }

    const lastHeading = headings[headings.length - 1];
    return {
        heading: lastHeading.text || 'Introduction',
        content: doc.textBetween(lastHeading.end, docEnd, '\n').trim(),
    };
};
