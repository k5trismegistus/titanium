import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type AssistAnchor = {
    id: string;
    from: number;
    to: number;
    valid: boolean;
    status: 'running' | 'ready';
};

type AnchorAction =
    | { type: 'add'; anchor: AssistAnchor }
    | { type: 'ready'; id: string }
    | { type: 'remove'; id: string };

export const assistAnchorKey = new PluginKey<AssistAnchor[]>('assistAnchors');

export const setAssistAnchorAction = (transaction: Transaction, action: AnchorAction) =>
    transaction.setMeta(assistAnchorKey, action);

export const getAssistAnchor = (state: EditorState, id: string) => {
    const anchors = assistAnchorKey.getState(state);
    return anchors?.find((anchor) => anchor.id === id);
};

export const assistAnchors = new Plugin<AssistAnchor[]>({
    key: assistAnchorKey,
    state: {
        init: () => [],
        apply(transaction, previous) {
            const mapped = previous.map((anchor) => {
                let { from, to, valid } = anchor;
                if (transaction.docChanged) {
                    for (const map of transaction.mapping.maps) {
                        map.forEach((oldStart, oldEnd) => {
                            if (
                                (oldStart < to && oldEnd > from) ||
                                (oldStart === oldEnd && oldStart > from && oldStart < to)
                            ) {
                                valid = false;
                            }
                        });
                        from = map.map(from, 1);
                        to = map.map(to, -1);
                    }
                }
                return { ...anchor, from, to, valid: valid && from < to };
            });
            const action = transaction.getMeta(assistAnchorKey) as AnchorAction | undefined;
            if (!action) return mapped;
            if (action.type === 'add') return [...mapped, action.anchor];
            if (action.type === 'remove') return mapped.filter((anchor) => anchor.id !== action.id);
            return mapped.map((anchor) =>
                anchor.id === action.id ? { ...anchor, status: 'ready' as const } : anchor,
            );
        },
    },
    props: {
        decorations(state) {
            const anchors = assistAnchorKey.getState(state) ?? [];
            const decorations = anchors.flatMap((anchor) => {
                if (!anchor.valid || anchor.from < 0 || anchor.to > state.doc.content.size) {
                    return [];
                }
                return [
                    Decoration.inline(anchor.from, anchor.to, {
                        class: 'assist-anchor',
                        'data-assist-id': anchor.id,
                    }),
                    Decoration.widget(
                        anchor.to,
                        () => {
                            const marker = document.createElement('span');
                            marker.className = 'assist-marker';
                            marker.textContent =
                                anchor.status === 'running' ? 'AI 処理中' : 'AI 結果あり';
                            marker.setAttribute('aria-label', marker.textContent);
                            marker.contentEditable = 'false';
                            return marker;
                        },
                        { side: 1, key: `${anchor.id}-${anchor.status}` },
                    ),
                ];
            });
            return DecorationSet.create(state.doc, decorations);
        },
    },
});
