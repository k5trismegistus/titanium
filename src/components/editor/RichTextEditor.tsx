import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from 'tiptap-markdown';
import { createPortal } from 'react-dom';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useEditorContext } from '../../context/EditorContext';
import {
    callArticleAssist,
    callEditorAssist,
    searchRelated,
    type ArticleAssistKind,
    type ArticleFactCheckResponse,
    type ArticleSuggestionsResponse,
    type EditorAssistRequest,
    type ExpandOutlineResponse,
    type FactCheckResponse,
} from '../../lib/firebase/functions';
import { assistAnchors, getAssistAnchor, setAssistAnchorAction } from './assistAnchors';
import {
    collectArticleBlocks,
    findCurrentArticleBlock,
    getInvalidArticleBlockIds,
    type ArticleBlock,
} from './articleBlocks';
import {
    getEditorMarkdown,
    prepareMarkdownForRichEditor,
    TitaniumHardBreak,
    TitaniumParagraph,
} from './editorMarkdown';
import { ActiveSection, updateActiveSectionFromEditor } from './editorSections';

type AssistJob = {
    id: string;
    kind: EditorAssistRequest['kind'] | ArticleAssistKind;
    selectedText: string;
    blocks: ArticleBlock[];
    status: 'running' | 'ready' | 'error';
    result?:
        | FactCheckResponse
        | ExpandOutlineResponse
        | ArticleFactCheckResponse
        | ArticleSuggestionsResponse;
    decisions?: Record<number, 'accepted' | 'dismissed'>;
    invalidBlockIds?: string[];
    error?: string;
};

const ARTICLE_ACTIONS: Array<{ kind: ArticleAssistKind; label: string; detail: string }> = [
    { kind: 'review', label: 'Review draft', detail: 'Clarity, repetition, and cuts' },
    { kind: 'articleFactCheck', label: 'Check all facts', detail: 'Sources for factual claims' },
    { kind: 'relatedMaterial', label: 'Suggest past notes', detail: 'Ideas from your notes' },
    { kind: 'openings', label: 'Title, opening & ending', detail: 'Three optional additions' },
];

export const RichTextEditor = ({
    content,
    setContent,
    readOnly,
    canUseAI,
    noteId,
    setActiveSection,
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    canUseAI: boolean;
    noteId?: string;
    setActiveSection: (next: ActiveSection) => void;
}) => {
    const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
    const [jobs, setJobs] = useState<AssistJob[]>([]);
    const [openJobId, setOpenJobId] = useState<string | null>(null);
    const [aiMenuOpen, setAiMenuOpen] = useState(false);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const [mobileToolbarHost, setMobileToolbarHost] = useState<HTMLElement | null>(null);
    const [desktopToolbarHost, setDesktopToolbarHost] = useState<HTMLElement | null>(null);
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
            setJobs((previous) =>
                previous.map((job) => {
                    if (job.blocks.length === 0) return job;
                    const invalid = getInvalidArticleBlockIds(
                        editor.state.doc,
                        job.blocks,
                        job.invalidBlockIds,
                    );
                    return invalid.length === (job.invalidBlockIds?.length ?? 0)
                        ? job
                        : { ...job, invalidBlockIds: invalid };
                }),
            );
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

    useLayoutEffect(() => {
        setMobileToolbarHost(document.getElementById('titanium-mobile-editor-toolbar'));
        setDesktopToolbarHost(document.getElementById('titanium-desktop-editor-toolbar'));
    }, []);

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

    useEffect(() => {
        if (!aiMenuOpen) return;
        const closeOnOutside = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('[data-ai-menu]')) {
                setAiMenuOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setAiMenuOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [aiMenuOpen]);

    useEffect(() => {
        if (selection) setAiMenuOpen(false);
    }, [selection]);

    const startAssist = async (kind: EditorAssistRequest['kind']) => {
        if (!editor || !selection || readOnly || !canUseAI) return;
        const { from, to } = selection;
        const selectedText = editor.state.doc.textBetween(from, to, '\n').trim();
        if (!selectedText) return;
        const id = crypto.randomUUID();
        const noteMarkdown = getEditorMarkdown(editor);
        setSelection(null);
        setEditorInteraction({ isTextSelected: false });
        setJobs((previous) => [
            ...previous,
            { id, kind, selectedText, blocks: [], status: 'running' },
        ]);
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
                              error: error instanceof Error ? error.message : 'AI request failed.',
                          }
                        : job,
                ),
            );
        }
    };

    const startArticleAssist = async (kind: ArticleAssistKind) => {
        if (!editor || readOnly || !canUseAI) return;
        setAiMenuOpen(false);
        const noteMarkdown = getEditorMarkdown(editor);
        const blocks = collectArticleBlocks(editor.state.doc);
        if (!noteMarkdown.trim() || blocks.length === 0) return;
        const id = crypto.randomUUID();
        setJobs((previous) => [
            ...previous,
            { id, kind, selectedText: '', blocks, status: 'running' },
        ]);
        try {
            let sourceNoteIds: string[] | undefined;
            if (kind === 'relatedMaterial') {
                const related = await searchRelated({
                    noteId: noteId ?? '',
                    limit: 5,
                    queryText: noteMarkdown.slice(0, 2_000),
                });
                sourceNoteIds = related.data.results.map((item) => item.id);
            }
            const response = await callArticleAssist({
                kind,
                noteMarkdown,
                blocks: blocks.map(({ id, type, text, level }) => ({
                    id,
                    type,
                    text,
                    ...(level === undefined ? {} : { level }),
                })),
                sourceNoteIds,
            });
            if (!mounted.current || editor.isDestroyed) return;
            setJobs((previous) =>
                previous.map((job) =>
                    job.id === id ? { ...job, status: 'ready', result: response.data } : job,
                ),
            );
        } catch (error) {
            if (!mounted.current || editor.isDestroyed) return;
            setJobs((previous) =>
                previous.map((job) =>
                    job.id === id
                        ? {
                              ...job,
                              status: 'error',
                              error: error instanceof Error ? error.message : 'AI request failed.',
                          }
                        : job,
                ),
            );
        }
    };

    const decideSuggestion = (
        job: AssistJob,
        index: number,
        decision: 'accepted' | 'dismissed',
    ) => {
        if (
            !editor ||
            job.result?.kind === 'articleFactCheck' ||
            !job.result ||
            !('suggestions' in job.result)
        )
            return;
        if (job.decisions?.[index]) return;
        const suggestion = job.result.suggestions[index];
        if (!suggestion) return;
        if (decision === 'accepted') {
            if (job.invalidBlockIds?.includes(suggestion.targetBlockId)) return;
            const original = job.blocks.find((block) => block.id === suggestion.targetBlockId);
            const current = original && findCurrentArticleBlock(editor.state.doc, original);
            if (!current) return;
            const content = prepareMarkdownForRichEditor(suggestion.replacementMarkdown);
            let applied: boolean;
            if (suggestion.action === 'remove') {
                applied = editor.commands.deleteRange({ from: current.from, to: current.to });
            } else if (suggestion.action === 'replace') {
                applied = editor.commands.insertContentAt(
                    { from: current.from, to: current.to },
                    content,
                );
            } else {
                const at = suggestion.action === 'insertBefore' ? current.from : current.to;
                applied = editor.commands.insertContentAt(at, content);
            }
            if (!applied) return;
        }
        setJobs((previous) =>
            previous.map((item) =>
                item.id === job.id
                    ? { ...item, decisions: { ...item.decisions, [index]: decision } }
                    : item,
            ),
        );
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
    const runningArticles = jobs.filter((job) => job.status === 'running' && job.blocks.length > 0);
    const showMobileAssist = Boolean(canUseAI && selection);
    const jobTitle = (kind: AssistJob['kind']) =>
        kind === 'factCheck'
            ? 'Fact-check'
            : kind === 'expandOutline'
              ? 'Expanded draft'
              : kind === 'articleFactCheck'
                ? 'Article fact-check'
                : (ARTICLE_ACTIONS.find((action) => action.kind === kind)?.label ?? 'AI result');

    const toolbar = (
        <div className="relative flex h-11 min-w-0 items-center border-y border-slate-200 bg-white/95 text-xs backdrop-blur">
            {showMobileAssist && (
                <div
                    className="flex w-full items-center gap-1 lg:hidden"
                    role="toolbar"
                    aria-label="AI actions for selected text"
                >
                    <button
                        type="button"
                        className="assist-action"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => void startAssist('factCheck')}
                    >
                        Fact-check
                    </button>
                    <button
                        type="button"
                        className="assist-action"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => void startAssist('expandOutline')}
                    >
                        Expand outline
                    </button>
                </div>
            )}
            <div
                className={`${showMobileAssist ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 items-center`}
            >
                {canUseAI && !selection && (
                    <div className="relative shrink-0" data-ai-menu>
                        <button
                            type="button"
                            className="assist-action ml-1 flex items-center gap-1"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => setAiMenuOpen((open) => !open)}
                            aria-expanded={aiMenuOpen}
                            aria-haspopup="menu"
                        >
                            <Sparkles size={14} aria-hidden="true" /> AI{' '}
                            <ChevronDown size={13} aria-hidden="true" />
                        </button>
                        {aiMenuOpen && (
                            <div
                                role="menu"
                                aria-label="AI for whole article"
                                className="absolute left-1 top-full z-50 mt-1 w-60 rounded-xl border border-violet-200 bg-white p-1 shadow-xl"
                            >
                                {ARTICLE_ACTIONS.map((action) => (
                                    <button
                                        key={action.kind}
                                        type="button"
                                        role="menuitem"
                                        onPointerDown={(event) => event.preventDefault()}
                                        onClick={() => void startArticleAssist(action.kind)}
                                        disabled={jobs.some(
                                            (job) =>
                                                job.kind === action.kind &&
                                                job.status === 'running',
                                        )}
                                        className="block w-full rounded-lg px-3 py-2 text-left hover:bg-violet-50 disabled:opacity-40"
                                    >
                                        <span className="block font-medium text-violet-800">
                                            {action.label}
                                        </span>
                                        <span className="block text-[11px] text-slate-500">
                                            {action.detail}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div
                    className="flex min-w-0 gap-1 overflow-x-auto"
                    role="toolbar"
                    aria-label="Formatting"
                >
                    <FormatButton
                        label="Text"
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
                        label="Bullets"
                        action={() => editor.chain().focus().toggleBulletList().run()}
                    />
                    <FormatButton
                        label="Numbered"
                        action={() => editor.chain().focus().toggleOrderedList().run()}
                    />
                    <FormatButton
                        label="Tasks"
                        action={() => editor.chain().focus().toggleTaskList().run()}
                    />
                    <FormatButton
                        label="Bold"
                        action={() => editor.chain().focus().toggleBold().run()}
                    />
                    <FormatButton
                        label="Image"
                        action={() => {
                            const url = window.prompt('Enter an image URL');
                            if (url && /^https:\/\//i.test(url)) {
                                editor.chain().focus().setImage({ src: url }).run();
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-4 pb-12">
            {!readOnly &&
                mobileToolbarHost &&
                createPortal(<div className="lg:hidden">{toolbar}</div>, mobileToolbarHost)}
            {!readOnly &&
                desktopToolbarHost &&
                createPortal(<div className="hidden lg:block">{toolbar}</div>, desktopToolbarHost)}
            {!readOnly && (!mobileToolbarHost || !desktopToolbarHost) && (
                <div
                    className={`${mobileToolbarHost ? 'hidden' : 'block'} ${desktopToolbarHost ? 'lg:hidden' : 'lg:block'} sticky z-30`}
                    style={{ top: 'var(--visual-viewport-top, 0px)' }}
                >
                    {toolbar}
                </div>
            )}
            <EditorContent editor={editor} />
            {!readOnly &&
                canUseAI &&
                selection &&
                createPortal(
                    <div
                        className="fixed inset-x-3 z-50 mx-auto hidden w-fit max-w-[calc(100vw-1.5rem)] gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur lg:flex"
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
                            Fact-check
                        </button>
                        <button
                            type="button"
                            className="assist-action"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void startAssist('expandOutline')}
                        >
                            Expand outline
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
                                className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-md"
                            >
                                {job.status === 'error'
                                    ? `${jobTitle(job.kind)} failed · View details`
                                    : `${jobTitle(job.kind)} ready · View result`}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
            {runningArticles.length > 0 &&
                createPortal(
                    <div
                        className="fixed right-3 top-[calc(4rem+env(safe-area-inset-top))] z-40 rounded-full border border-violet-200 bg-white/95 px-3 py-2 text-xs text-violet-800 shadow-sm"
                        role="status"
                    >
                        <Sparkles size={13} className="mr-1 inline" aria-hidden="true" />
                        AI working · Keep writing
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
                            aria-label={jobTitle(openJob.kind)}
                        >
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h2 className="font-semibold">{jobTitle(openJob.kind)}</h2>
                                <button
                                    type="button"
                                    onClick={() => setOpenJobId(null)}
                                    aria-label="Close"
                                >
                                    Close
                                </button>
                            </div>
                            {openJob.selectedText && (
                                <p className="mb-4 line-clamp-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                                    {openJob.selectedText}
                                </p>
                            )}
                            {openJob.status === 'error' && (
                                <p className="text-sm text-red-700">{openJob.error}</p>
                            )}
                            {(openJob.result?.kind === 'factCheck' ||
                                openJob.result?.kind === 'articleFactCheck') && (
                                <FactCheckReport result={openJob.result} />
                            )}
                            {openJob.result?.kind === 'expandOutline' && (
                                <>
                                    <p className="mb-3 text-xs text-slate-500">
                                        Replace the selected outline with this draft.
                                    </p>
                                    <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                                        {openJob.result.replacementMarkdown}
                                    </div>
                                    {!openAnchor?.valid && (
                                        <p className="mt-3 text-sm text-amber-700">
                                            The original selection changed, so it can no longer be
                                            replaced.
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        disabled={!openAnchor?.valid}
                                        onClick={() => acceptExpansion(openJob)}
                                        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-40"
                                    >
                                        Replace selection
                                    </button>
                                </>
                            )}
                            {openJob.result && 'suggestions' in openJob.result && (
                                <div className="space-y-4">
                                    {openJob.result.suggestions.length === 0 && (
                                        <p className="text-sm text-slate-600">
                                            No strong suggestions found for this draft.
                                        </p>
                                    )}
                                    {openJob.result.suggestions.map((suggestion, index) => {
                                        const original = openJob.blocks.find(
                                            (block) => block.id === suggestion.targetBlockId,
                                        );
                                        const current =
                                            !openJob.invalidBlockIds?.includes(
                                                suggestion.targetBlockId,
                                            ) &&
                                            original &&
                                            findCurrentArticleBlock(editor.state.doc, original);
                                        const decision = openJob.decisions?.[index];
                                        return (
                                            <article
                                                key={index}
                                                className="rounded-xl border border-violet-100 p-4 text-sm"
                                            >
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <h3 className="font-semibold text-violet-900">
                                                        {suggestion.label}
                                                    </h3>
                                                    {decision && (
                                                        <span className="text-xs text-slate-500">
                                                            {decision === 'accepted'
                                                                ? 'Accepted'
                                                                : 'Dismissed'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mb-3 text-slate-600">
                                                    {suggestion.reason}
                                                </p>
                                                <p className="mb-2 text-xs text-slate-500">
                                                    Target:{' '}
                                                    {original?.text ?? 'Paragraph unavailable'}
                                                </p>
                                                {suggestion.sourceExcerpt && (
                                                    <p className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                                                        From a past note: “
                                                        {suggestion.sourceExcerpt}”{' '}
                                                        {suggestion.sourceNoteId && (
                                                            <a
                                                                className="text-violet-700 underline"
                                                                href={`/note/${encodeURIComponent(suggestion.sourceNoteId)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                Open note
                                                            </a>
                                                        )}
                                                    </p>
                                                )}
                                                <div className="whitespace-pre-wrap rounded-lg bg-violet-50 p-3 text-sm">
                                                    <span className="mb-1 block text-xs font-medium text-violet-800">
                                                        {suggestion.action === 'remove'
                                                            ? 'Remove target'
                                                            : suggestion.action === 'replace'
                                                              ? 'Replace target with'
                                                              : suggestion.action === 'insertBefore'
                                                                ? 'Insert before target'
                                                                : 'Insert after target'}
                                                    </span>
                                                    {suggestion.action === 'remove'
                                                        ? 'The target text will be deleted.'
                                                        : suggestion.replacementMarkdown}
                                                </div>
                                                {!current && !decision && (
                                                    <p className="mt-2 text-xs text-amber-700">
                                                        The target changed or is duplicated. This
                                                        suggestion can no longer be applied.
                                                    </p>
                                                )}
                                                {!decision && (
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={!current}
                                                            onClick={() =>
                                                                decideSuggestion(
                                                                    openJob,
                                                                    index,
                                                                    'accepted',
                                                                )
                                                            }
                                                            className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                decideSuggestion(
                                                                    openJob,
                                                                    index,
                                                                    'dismissed',
                                                                )
                                                            }
                                                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => dismissJob(openJob.id)}
                                className="mt-4 ml-3 text-sm text-slate-500"
                            >
                                {openJob.kind === 'factCheck' || openJob.kind === 'articleFactCheck'
                                    ? 'Dismiss report'
                                    : openJob.kind === 'expandOutline'
                                      ? 'Discard draft'
                                      : 'Discard suggestions'}
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

type GroundedReport = Omit<FactCheckResponse, 'kind'>;
const FactCheckReport = ({ result }: { result: GroundedReport }) => {
    return (
        <div className="space-y-4 text-sm">
            {result.grounded ? (
                <>
                    <p className="text-xs text-slate-500">
                        Only claims linked to a source have supporting evidence. Unlinked claims
                        remain unverified.
                    </p>
                    <div className="whitespace-pre-wrap leading-relaxed">
                        <GroundedText result={result} />
                    </div>
                    <div>
                        <h3 className="mb-2 font-semibold">Sources</h3>
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
                    No supporting evidence was found in public sources. This text remains
                    unverified.
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

const GroundedText = ({ result }: { result: GroundedReport }) => {
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
                            aria-label={`Source ${index + 1}`}
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
