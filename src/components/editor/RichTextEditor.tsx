import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from 'tiptap-markdown';
import { createPortal } from 'react-dom';
import { useEditorContext } from '../../context/EditorContext';
import {
    callEditorAssist,
    type EditorAssistRequest,
    type FactCheckResponse,
} from '../../lib/firebase/functions';
import { assistAnchors, getAssistAnchor, setAssistAnchorAction } from './assistAnchors';
import {
    getEditorMarkdown,
    prepareMarkdownForRichEditor,
    TitaniumHardBreak,
    TitaniumParagraph,
} from './editorMarkdown';
import { ActiveSection, updateActiveSectionFromEditor } from './editorSections';

type AssistJob = {
    id: string;
    kind: EditorAssistRequest['kind'];
    selectedText: string;
    status: 'running' | 'ready' | 'error';
    result?: FactCheckResponse | { kind: 'expandOutline'; replacementMarkdown: string };
    error?: string;
};

export const RichTextEditor = ({
    content,
    setContent,
    readOnly,
    canUseAI,
    setActiveSection,
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    canUseAI: boolean;
    setActiveSection: (next: ActiveSection) => void;
}) => {
    const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
    const [jobs, setJobs] = useState<AssistJob[]>([]);
    const [openJobId, setOpenJobId] = useState<string | null>(null);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const mounted = useRef(true);
    const { setEditorInteraction } = useEditorContext();

    const extensions = useMemo(
        () => [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                hardBreak: false,
                paragraph: false,
            }),
            TitaniumParagraph,
            TitaniumHardBreak,
            TaskList,
            TaskItem.configure({ nested: true }),
            Image,
            Placeholder.configure({ placeholder: 'Start writing...' }),
            Markdown.configure({
                html: false,
                bulletListMarker: '-',
                breaks: true,
                transformPastedText: false,
                transformCopiedText: true,
            }),
            Extension.create({
                name: 'assistAnchors',
                addProseMirrorPlugins: () => [assistAnchors],
            }),
        ],
        [],
    );

    const editor = useEditor({
        extensions,
        content: prepareMarkdownForRichEditor(content || ''),
        editable: !readOnly,
        editorProps: { attributes: { class: 'tiptap' } },
        onUpdate: ({ editor, transaction }) => {
            if (!transaction.docChanged) return;
            setContent(getEditorMarkdown(editor));
            updateActiveSectionFromEditor(editor, setActiveSection);
        },
        onSelectionUpdate: ({ editor }) => {
            updateActiveSectionFromEditor(editor, setActiveSection);
            const { from, to, empty } = editor.state.selection;
            setSelection(empty || readOnly ? null : { from, to });
            setEditorInteraction({ isTextSelected: !empty && !readOnly });
        },
    });

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            setEditorInteraction({
                isTextSelected: false,
                isKeyboardOpen: false,
            });
        };
    }, [setEditorInteraction]);

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!readOnly);
    }, [editor, readOnly]);

    useEffect(() => {
        if (!editor || editor.isFocused) return;
        const markdown = getEditorMarkdown(editor);
        if (content !== markdown) {
            editor.commands.setContent(prepareMarkdownForRichEditor(content || ''), {
                emitUpdate: false,
            });
            updateActiveSectionFromEditor(editor, setActiveSection);
        }
    }, [content, editor, setActiveSection]);

    useEffect(() => {
        if (editor) updateActiveSectionFromEditor(editor, setActiveSection);
    }, [editor, setActiveSection]);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const update = () => {
            const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
            const next = inset > 80 ? inset : 0;
            setKeyboardInset(next);
            setEditorInteraction({ isKeyboardOpen: next > 0 });
        };
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);
        update();
        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
        };
    }, [setEditorInteraction]);

    const startAssist = async (kind: EditorAssistRequest['kind']) => {
        if (!editor || !selection || readOnly || !canUseAI) return;
        const { from, to } = selection;
        const selectedText = editor.state.doc.textBetween(from, to, '\n').trim();
        if (!selectedText) return;
        const id = crypto.randomUUID();
        const noteMarkdown = getEditorMarkdown(editor);
        setSelection(null);
        setEditorInteraction({ isTextSelected: false });
        setJobs((previous) => [...previous, { id, kind, selectedText, status: 'running' }]);
        editor.view.dispatch(
            setAssistAnchorAction(editor.state.tr, {
                type: 'add',
                anchor: { id, from, to, valid: true, status: 'running' },
            }),
        );
        try {
            const response = await callEditorAssist({ kind, selectedText, noteMarkdown });
            if (!mounted.current || editor.isDestroyed) return;
            editor.view.dispatch(setAssistAnchorAction(editor.state.tr, { type: 'ready', id }));
            setJobs((previous) =>
                previous.map((job) =>
                    job.id === id ? { ...job, status: 'ready', result: response.data } : job,
                ),
            );
        } catch (error) {
            if (!mounted.current || editor.isDestroyed) return;
            editor.view.dispatch(setAssistAnchorAction(editor.state.tr, { type: 'remove', id }));
            setJobs((previous) =>
                previous.map((job) =>
                    job.id === id
                        ? {
                              ...job,
                              status: 'error',
                              error:
                                  error instanceof Error
                                      ? error.message
                                      : 'AI 処理に失敗しました。',
                          }
                        : job,
                ),
            );
        }
    };

    const dismissJob = (id: string) => {
        if (editor && !editor.isDestroyed) {
            editor.view.dispatch(setAssistAnchorAction(editor.state.tr, { type: 'remove', id }));
        }
        setJobs((previous) => previous.filter((job) => job.id !== id));
        setOpenJobId(null);
    };

    const acceptExpansion = (job: AssistJob) => {
        if (!editor || job.result?.kind !== 'expandOutline') return;
        const anchor = getAssistAnchor(editor.state, job.id);
        if (!anchor?.valid) return;
        editor.commands.insertContentAt(
            { from: anchor.from, to: anchor.to },
            prepareMarkdownForRichEditor(job.result.replacementMarkdown),
        );
        dismissJob(job.id);
    };

    if (!editor) return <div className="min-h-[40dvh]" />;
    const openJob = jobs.find((job) => job.id === openJobId);
    const openAnchor = openJob ? getAssistAnchor(editor.state, openJob.id) : undefined;
    const completed = jobs.filter((job) => job.status !== 'running');

    return (
        <div className="space-y-4 pb-12">
            {!readOnly && (
                <div className="sticky top-[calc(var(--global-header-height,3.5rem)+var(--editor-header-height,0px))] z-20 flex gap-1 overflow-x-auto bg-white/95 py-2 text-xs backdrop-blur">
                    <FormatButton
                        label="本文"
                        action={() => editor.chain().focus().setParagraph().run()}
                    />
                    <FormatButton
                        label="H1"
                        action={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    />
                    <FormatButton
                        label="H2"
                        action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    />
                    <FormatButton
                        label="H3"
                        action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    />
                    <FormatButton
                        label="箇条書き"
                        action={() => editor.chain().focus().toggleBulletList().run()}
                    />
                    <FormatButton
                        label="番号"
                        action={() => editor.chain().focus().toggleOrderedList().run()}
                    />
                    <FormatButton
                        label="チェック"
                        action={() => editor.chain().focus().toggleTaskList().run()}
                    />
                    <FormatButton
                        label="太字"
                        action={() => editor.chain().focus().toggleBold().run()}
                    />
                    <FormatButton
                        label="画像"
                        action={() => {
                            const url = window.prompt('画像の URL を入力してください');
                            if (url && /^https:\/\//i.test(url)) {
                                editor.chain().focus().setImage({ src: url }).run();
                            }
                        }}
                    />
                </div>
            )}
            <EditorContent editor={editor} />
            {!readOnly &&
                canUseAI &&
                selection &&
                createPortal(
                    <div
                        className="fixed inset-x-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur"
                        style={{
                            bottom: `calc(${keyboardInset}px + 0.5rem + env(safe-area-inset-bottom))`,
                        }}
                    >
                        <button
                            type="button"
                            className="assist-action"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void startAssist('factCheck')}
                        >
                            ファクトチェック
                        </button>
                        <button
                            type="button"
                            className="assist-action"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void startAssist('expandOutline')}
                        >
                            文章に展開
                        </button>
                    </div>,
                    document.body,
                )}
            {completed.length > 0 &&
                createPortal(
                    <div className="fixed right-3 top-[calc(7rem+env(safe-area-inset-top))] z-40 flex max-w-[min(18rem,80vw)] flex-col gap-2">
                        {completed.map((job) => (
                            <button
                                key={job.id}
                                type="button"
                                onClick={() => setOpenJobId(job.id)}
                                className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-md"
                            >
                                {job.status === 'error'
                                    ? 'AI 処理に失敗しました'
                                    : job.kind === 'factCheck'
                                      ? 'ファクトチェック完了 · 結果を見る'
                                      : '文章案が完成 · 確認する'}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
            {openJob &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/20 lg:items-center"
                        onClick={() => setOpenJobId(null)}
                    >
                        <section
                            className="max-h-[80dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl lg:rounded-2xl"
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label={
                                openJob.kind === 'factCheck'
                                    ? 'ファクトチェック結果'
                                    : '文章案の確認'
                            }
                        >
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h2 className="font-semibold">
                                    {openJob.kind === 'factCheck' ? 'ファクトチェック' : '文章案'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setOpenJobId(null)}
                                    aria-label="閉じる"
                                >
                                    閉じる
                                </button>
                            </div>
                            <p className="mb-4 line-clamp-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                                {openJob.selectedText}
                            </p>
                            {openJob.status === 'error' && (
                                <p className="text-sm text-red-700">{openJob.error}</p>
                            )}
                            {openJob.result?.kind === 'factCheck' && (
                                <FactCheckReport result={openJob.result} />
                            )}
                            {openJob.result?.kind === 'expandOutline' && (
                                <>
                                    <p className="mb-3 text-xs text-slate-500">
                                        選択したアウトラインを次の文章に置き換えます。
                                    </p>
                                    <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                                        {openJob.result.replacementMarkdown}
                                    </div>
                                    {!openAnchor?.valid && (
                                        <p className="mt-3 text-sm text-amber-700">
                                            元の範囲が編集されたため、置き換えできません。
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        disabled={!openAnchor?.valid}
                                        onClick={() => acceptExpansion(openJob)}
                                        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-40"
                                    >
                                        この文章に置き換える
                                    </button>
                                </>
                            )}
                            <button
                                type="button"
                                onClick={() => dismissJob(openJob.id)}
                                className="mt-4 ml-3 text-sm text-slate-500"
                            >
                                {openJob.kind === 'factCheck' ? '閉じて破棄' : '案を破棄'}
                            </button>
                        </section>
                    </div>,
                    document.body,
                )}
        </div>
    );
};

const FormatButton = ({ label, action }: { label: string; action: () => void }) => (
    <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={action}
        className="shrink-0 rounded-lg border border-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-50"
    >
        {label}
    </button>
);

const FactCheckReport = ({ result }: { result: FactCheckResponse }) => {
    return (
        <div className="space-y-4 text-sm">
            {result.grounded ? (
                <>
                    <p className="text-xs text-slate-500">
                        出典リンクのある記述のみ根拠を確認できます。リンクのない記述は未検証です。
                    </p>
                    <div className="whitespace-pre-wrap leading-relaxed">
                        <GroundedText result={result} />
                    </div>
                    <div>
                        <h3 className="mb-2 font-semibold">出典</h3>
                        <ol className="space-y-1">
                            {result.sources.map((source) => (
                                <li key={source.index}>
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-700 underline"
                                    >
                                        [{source.index + 1}] {source.title || source.url}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </div>
                </>
            ) : (
                <p className="text-sm text-amber-700">
                    公開情報から根拠を確認できませんでした。この文章は検証済みではありません。
                </p>
            )}
            {result.searchSuggestionsHtml && (
                <iframe
                    title="Google Search suggestions"
                    srcDoc={result.searchSuggestionsHtml}
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    className="h-40 w-full border-0"
                />
            )}
        </div>
    );
};

const GroundedText = ({ result }: { result: FactCheckResponse }) => {
    const matches = result.supports
        .map((support) => ({ ...support, at: result.report.indexOf(support.text) }))
        .filter((support) => support.at >= 0)
        .sort((a, b) => a.at - b.at);
    const chunks: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of matches) {
        if (match.at < cursor) continue;
        chunks.push(result.report.slice(cursor, match.at));
        chunks.push(
            <span key={`${match.at}-${match.text}`}>
                {match.text}
                {match.sourceIndices.map((index) => {
                    const source = result.sources.find((item) => item.index === index);
                    return source ? (
                        <a
                            key={index}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-0.5 align-super text-xs text-emerald-700 underline"
                            aria-label={`出典 ${index + 1}`}
                        >
                            [{index + 1}]
                        </a>
                    ) : null;
                })}
            </span>,
        );
        cursor = match.at + match.text.length;
    }
    chunks.push(result.report.slice(cursor));
    return <>{chunks}</>;
};
