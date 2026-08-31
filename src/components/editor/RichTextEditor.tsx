import { useEffect, useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Markdown } from 'tiptap-markdown';
import { getEditorMarkdown, prepareMarkdownForRichEditor, TitaniumHardBreak, TitaniumParagraph } from './editorMarkdown';
import { ActiveSection, updateActiveSectionFromEditor } from './editorSections';

export const RichTextEditor = ({
    content,
    setContent,
    readOnly,
    setActiveSection
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    setActiveSection: (next: ActiveSection) => void;
}) => {
    const extensions = useMemo(() => [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            hardBreak: false,
            paragraph: false
        }),
        TitaniumParagraph,
        TitaniumHardBreak,
        TaskList,
        TaskItem.configure({ nested: true }),
        Image,
        Placeholder.configure({
            placeholder: "Start writing..."
        }),
        Markdown.configure({
            html: false,
            bulletListMarker: "-",
            breaks: true,
            transformPastedText: false,
            transformCopiedText: true
        })
    ], []);

    const editor = useEditor({
        extensions,
        content: prepareMarkdownForRichEditor(content || ""),
        editable: !readOnly,
        editorProps: {
            attributes: {
                class: "tiptap"
            },
            handleDOMEvents: {
                pointerdown: (view, event) => {
                    const pointerEvent = event as PointerEvent;
                    if (pointerEvent.pointerType !== "touch") return false;

                    const position = view.posAtCoords({
                        left: pointerEvent.clientX,
                        top: pointerEvent.clientY
                    });
                    if (!position) return false;

                    event.preventDefault();
                    restoreTouchSelection(view, position.pos);

                    return true;
                }
            }
        },
        onUpdate: ({ editor, transaction }) => {
            if (!transaction.docChanged || !editor.isFocused) {
                return;
            }
            const markdown = getEditorMarkdown(editor);
            setContent(markdown);
            updateActiveSectionFromEditor(editor, setActiveSection);
        },
        onSelectionUpdate: ({ editor }) => {
            updateActiveSectionFromEditor(editor, setActiveSection);
        }
    });

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!readOnly);
    }, [editor, readOnly]);

    useEffect(() => {
        if (!editor) return;
        if (editor.isFocused) return;
        const markdown = getEditorMarkdown(editor);
        if (content !== markdown) {
            editor.commands.setContent(prepareMarkdownForRichEditor(content || ""), { emitUpdate: false });
            updateActiveSectionFromEditor(editor, setActiveSection);
        }
    }, [content, editor, setActiveSection]);

    useEffect(() => {
        if (!editor) return;
        updateActiveSectionFromEditor(editor, setActiveSection);
    }, [editor, setActiveSection]);

    if (!editor) {
        return <div className="min-h-[40dvh]" />;
    }

    return (
        <div className="space-y-4 pb-12">
            <EditorContent editor={editor} />
        </div>
    );
};

const restoreTouchSelection = (view: EditorView, pos: number) => {
    const restore = () => {
        if (view.isDestroyed) return;
        view.focus();
        const safePos = Math.max(0, Math.min(pos, view.state.doc.content.size));
        const selection = createTextSelection(view, safePos);
        view.dispatch(view.state.tr.setSelection(selection));
    };

    // iOS はキーボード表示と selection 更新の順序が揺れるため、座標由来の選択位置を短く再適用する。
    restore();
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 60);
};

const createTextSelection = (view: EditorView, pos: number) => {
    try {
        return TextSelection.create(view.state.doc, pos);
    } catch {
        return TextSelection.near(view.state.doc.resolve(pos));
    }
};
