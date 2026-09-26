import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type ArticleBlock = {
    id: string;
    type: 'heading' | 'paragraph';
    text: string;
    level?: number;
};

export type LocatedArticleBlock = ArticleBlock & { from: number; to: number };

export const collectArticleBlocks = (doc: ProseMirrorNode): LocatedArticleBlock[] => {
    const blocks: LocatedArticleBlock[] = [];
    doc.forEach((node, offset) => {
        if (node.type.name !== 'heading' && node.type.name !== 'paragraph') return;
        const text = node.textBetween(0, node.content.size, '\n').trim();
        if (!text) return;
        blocks.push({
            id: `block-${blocks.length}`,
            type: node.type.name,
            text,
            ...(node.type.name === 'heading' ? { level: Number(node.attrs.level) || 1 } : {}),
            from: offset,
            to: offset + node.nodeSize,
        });
    });
    return blocks;
};

// A changed or duplicated paragraph must never be replaced by an older AI result.
export const findCurrentArticleBlock = (
    doc: ProseMirrorNode,
    original: ArticleBlock,
): LocatedArticleBlock | null => {
    const matches = collectArticleBlocks(doc).filter(
        (block) => block.type === original.type && block.text === original.text,
    );
    return matches.length === 1 ? matches[0] : null;
};

export const getInvalidArticleBlockIds = (
    doc: ProseMirrorNode,
    originals: ArticleBlock[],
    alreadyInvalid: string[] = [],
): string[] => {
    const invalid = new Set(alreadyInvalid);
    for (const block of originals) {
        if (!invalid.has(block.id) && !findCurrentArticleBlock(doc, block)) invalid.add(block.id);
    }
    return [...invalid];
};
