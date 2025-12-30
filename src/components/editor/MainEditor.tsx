import React, { useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Heading1, CheckSquare, List, Quote, Image as ImageIcon } from 'lucide-react';
import { useEditorContext } from '../../context/EditorContext';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import type { MarkdownStorage } from 'tiptap-markdown';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const MainEditor: React.FC<{ content: string; setContent: (next: string) => void; readOnly?: boolean }> = ({ content, setContent, readOnly = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { setActiveSection } = useEditorContext();
    const [cursorIndex, setCursorIndex] = useState(0);
    const [editorMode, setEditorMode] = useState<"rich" | "markdown">("rich");

    useEffect(() => {
        if (readOnly) return;
        if (typeof window === "undefined" || !window.visualViewport) return;

        const viewport = window.visualViewport;
        const updateOffset = () => {
            const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
            document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
        };

        updateOffset();
        viewport.addEventListener("resize", updateOffset);
        viewport.addEventListener("scroll", updateOffset);
        return () => {
            viewport.removeEventListener("resize", updateOffset);
            viewport.removeEventListener("scroll", updateOffset);
            document.documentElement.style.removeProperty("--keyboard-offset");
        };
    }, [readOnly]);

    const insertText = (before: string, after: string = "") => {
        if (readOnly) return;
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = textarea.value;

        // Check if start is at beginning of line
        const lineStart = currentText.lastIndexOf('\n', start - 1) + 1;
        const isAtLineStart = start === lineStart;

        const newText = currentText.slice(0, start) + (isAtLineStart ? before : "\n" + before) + currentText.slice(end) + after;

        setContent(newText);

        // Restore focus
        requestAnimationFrame(() => {
            textarea.focus();
            const newCursorPos = start + (isAtLineStart ? before.length : before.length + 1);
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        });
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return;
        const file = e.target.files?.[0];
        if (!file) return;

        // Simple validation
        if (!file.type.startsWith('image/')) {
            alert("Please select an image file.");
            return;
        }

        try {
            // Lazy load storage to avoid init errors if not used
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
            const storage = getStorage(); // Uses default app

            // Path: images/{userId}/{timestamp}_{filename}
            // We need userId. We could get it from Auth context, or just use a random path if we trust rules.
            // Better to pass usage auth or assume authenticated due to rules.
            // Let's use a generic 'uploads' folder for MVP if auth context isn't handy in this component props.
            // Actually, MainEditor is inside authenticated routes usually.

            const timestamp = Date.now();
            const storageRef = ref(storage, `uploads/${timestamp}_${file.name}`);

            // Upload
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);

            // Insert Markdown
            insertText(`![${file.name}](${url})`);

        } catch (error) {
            console.error("Upload failed:", error);
            alert("Image upload failed.");
        } finally {
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (editorMode !== "markdown") return;
        const { heading, content: sectionContent } = extractSectionAtCursor(content, cursorIndex);
        const text = [heading, sectionContent].filter(Boolean).join("\n");
        setActiveSection({ text, heading });
    }, [content, cursorIndex, editorMode, setActiveSection]);

    return (
        <div className="relative w-full max-w-2xl mx-auto min-h-[calc(100dvh-10rem)] bg-white pt-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="text-xs text-gray-400">Editor</div>
                <div className="inline-flex items-center gap-1 rounded-lg border border-muted bg-white p-1 text-xs">
                    <ModeButton
                        label="WYSIWYG"
                        isActive={editorMode === "rich"}
                        onClick={() => setEditorMode("rich")}
                    />
                    <ModeButton
                        label="Markdown"
                        isActive={editorMode === "markdown"}
                        onClick={() => setEditorMode("markdown")}
                    />
                </div>
            </div>

            {!readOnly && editorMode === "markdown" && (
                <>
                    {/* Floating Toolbar (Mobile only) */}
                    <div
                        className="sm:hidden fixed left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur-sm py-2 px-2 rounded-xl border border-muted shadow-md flex gap-2"
                        style={{ bottom: "calc(1rem + var(--keyboard-offset, 0px) + env(safe-area-inset-bottom))" }}
                    >
                        <ToolbarButton icon={<Heading1 size={18} />} onClick={() => insertText("# ")} label="Heading 1" />
                        <ToolbarButton icon={<Heading1 size={14} className="mt-1" />} onClick={() => insertText("## ")} label="Heading 2" />
                        <div className="w-px bg-gray-200 mx-1" />
                        <ToolbarButton icon={<List size={18} />} onClick={() => insertText("- ")} label="List" />
                        <ToolbarButton icon={<CheckSquare size={18} />} onClick={() => insertText("- [ ] ")} label="Task" />
                        <ToolbarButton icon={<Quote size={18} />} onClick={() => insertText("> ")} label="Quote" />
                        <div className="w-px bg-gray-200 mx-1" />
                        <ToolbarButton icon={<ImageIcon size={18} />} onClick={() => fileInputRef.current?.click()} label="Image" />
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                    />
                </>
            )}

            {editorMode === "markdown" ? (
                <>
                    <TextareaAutosize
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => {
                            if (readOnly) return;
                            setContent(e.target.value);
                            setCursorIndex(e.target.selectionStart ?? 0);
                        }}
                        onSelect={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            setCursorIndex(target.selectionStart ?? 0);
                        }}
                        onClick={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            setCursorIndex(target.selectionStart ?? 0);
                        }}
                        onKeyUp={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            setCursorIndex(target.selectionStart ?? 0);
                        }}
                        placeholder="Start writing..."
                        readOnly={readOnly}
                        className="w-full resize-none outline-none text-lg text-text leading-relaxed placeholder:text-gray-300 break-all"
                        minRows={20}
                    />

                    <div className="mt-8 border-t border-muted pt-4">
                        <div className="text-xs text-gray-400 mb-3">Preview</div>
                        <MarkdownPreview markdown={content} />
                    </div>
                </>
            ) : (
                <TiptapEditor
                    content={content}
                    setContent={setContent}
                    readOnly={readOnly}
                    setActiveSection={setActiveSection}
                />
            )}
        </div>
    );
};

const extractSectionAtCursor = (markdown: string, cursorIndex: number) => {
    if (!markdown) {
        return { heading: "Introduction", content: "" };
    }

    const safeCursor = Math.max(0, Math.min(cursorIndex, markdown.length));
    const headingRegex = /^#{1,3}\s+.*$/gm;
    const matches = Array.from(markdown.matchAll(headingRegex));

    if (matches.length === 0) {
        return { heading: "Introduction", content: markdown.trim() };
    }

    const firstHeadingIndex = matches[0].index ?? 0;
    if (safeCursor < firstHeadingIndex) {
        const nextStart = firstHeadingIndex;
        return {
            heading: "Introduction",
            content: markdown.slice(0, nextStart).trim()
        };
    }

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const start = match.index ?? 0;
        const next = matches[i + 1];
        const nextStart = next?.index ?? markdown.length;

        if (safeCursor >= start && safeCursor < nextStart) {
            const headingLine = match[0];
            const heading = headingLine.replace(/^#+\s+/, "");
            const lineEnd = markdown.indexOf("\n", start);
            const contentStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
            const content = markdown.slice(contentStart, nextStart).trim();
            return { heading, content };
        }
    }

    const lastMatch = matches[matches.length - 1];
    const lastStart = lastMatch.index ?? 0;
    const headingLine = lastMatch[0];
    const heading = headingLine.replace(/^#+\s+/, "");
    const lineEnd = markdown.indexOf("\n", lastStart);
    const contentStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const content = markdown.slice(contentStart).trim();
    return { heading, content };
};

const MarkdownPreview = ({ markdown }: { markdown: string }) => {
    const lines = markdown.split("\n");

    return (
        <div className="space-y-1 text-gray-700 break-all">
            {lines.map((line, index) => {
                const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const hashes = headingMatch[1];
                    const title = headingMatch[2];
                    const sizeClass = level === 1 ? "text-2xl" : level === 2 ? "text-xl" : "text-lg";
                    return (
                        <div key={`h-${index}`} className={`${sizeClass} font-semibold text-gray-900`}>
                            <span className="text-gray-400 mr-2">{hashes}</span>
                            <span>{title}</span>
                        </div>
                    );
                }

                if (line.trim() === "") {
                    return <div key={`e-${index}`} className="h-4" />;
                }

                return (
                    <div key={`p-${index}`} className="whitespace-pre-wrap text-base">
                        {line}
                    </div>
                );
            })}
        </div>
    );
};

const TiptapEditor = ({
    content,
    setContent,
    readOnly,
    setActiveSection
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    setActiveSection: (next: { text: string; heading: string }) => void;
}) => {
    const [isToolbarVisible, setIsToolbarVisible] = useState(false);

    const extensions = useMemo(() => [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] }
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Image,
        Placeholder.configure({
            placeholder: "Start writing..."
        }),
        Markdown.configure({
            html: false,
            bulletListMarker: "-",
            transformPastedText: true,
            transformCopiedText: false
        })
    ], []);

    const editor = useEditor({
        extensions,
        content: content || "",
        editable: !readOnly,
        editorProps: {
            attributes: {
                class: "tiptap"
            }
        },
        onUpdate: ({ editor }) => {
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
        if (readOnly) {
            setIsToolbarVisible(false);
        }
    }, [editor, readOnly]);

    useEffect(() => {
        if (!editor) return;
        const handleFocus = () => {
            if (!readOnly) {
                setIsToolbarVisible(true);
            }
        };
        const handleBlur = () => setIsToolbarVisible(false);
        editor.on("focus", handleFocus);
        editor.on("blur", handleBlur);
        return () => {
            editor.off("focus", handleFocus);
            editor.off("blur", handleBlur);
        };
    }, [editor, readOnly]);

    useEffect(() => {
        if (!editor) return;
        const markdown = getEditorMarkdown(editor);
        if (content !== markdown) {
            editor.commands.setContent(content || "", { emitUpdate: false });
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

    const isPlainTextActive = editor.isActive("paragraph")
        && !editor.isActive("heading")
        && !editor.isActive("bulletList")
        && !editor.isActive("taskList")
        && !editor.isActive("blockquote");

    return (
        <div className="space-y-4 pb-24">
            <EditorContent editor={editor} />

            {!readOnly && isToolbarVisible && (
                <div
                    className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-muted bg-white/95 px-3 py-2 text-sm shadow-md backdrop-blur max-w-[calc(100vw-2rem)] overflow-x-auto whitespace-nowrap"
                    style={{ bottom: "calc(1rem + var(--keyboard-offset, 0px) + env(safe-area-inset-bottom))" }}
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <LineTypeButton label="Text" isActive={isPlainTextActive} onClick={() => editor.chain().focus().setParagraph().run()} />
                    <LineTypeButton label="H1" isActive={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
                    <LineTypeButton label="H2" isActive={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
                    <LineTypeButton label="H3" isActive={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
                    <LineTypeButton label="List" isActive={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
                    <LineTypeButton label="Task" isActive={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
                    <LineTypeButton label="Quote" isActive={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
                </div>
            )}
        </div>
    );
};

const updateActiveSectionFromEditor = (editor: Editor, setActiveSection: (next: { text: string; heading: string }) => void) => {
    const selectionFrom = editor.state.selection.from;
    const { heading, content } = extractSectionFromDoc(editor.state.doc, selectionFrom);
    const text = [heading, content].filter(Boolean).join("\n");
    setActiveSection({ text, heading });
};

const getEditorMarkdown = (editor: Editor) => {
    const storage = editor.storage as { markdown?: MarkdownStorage };
    if (storage.markdown) {
        return storage.markdown.getMarkdown();
    }
    return editor.getText();
};

const extractSectionFromDoc = (doc: ProseMirrorNode, selectionFrom: number) => {
    const headings: Array<{ pos: number; end: number; text: string }> = [];

    doc.descendants((node, pos) => {
        if (node.type.name === "heading" && typeof node.attrs.level === "number" && node.attrs.level <= 3) {
            headings.push({ pos, end: pos + node.nodeSize, text: node.textContent });
        }
    });

    const docEnd = doc.content.size;
    const safeSelection = Math.max(0, Math.min(selectionFrom, docEnd));

    if (headings.length === 0) {
        return { heading: "Introduction", content: doc.textBetween(0, docEnd, "\n").trim() };
    }

    const firstHeading = headings[0];
    if (safeSelection < firstHeading.pos) {
        return {
            heading: "Introduction",
            content: doc.textBetween(0, firstHeading.pos, "\n").trim()
        };
    }

    for (let i = 0; i < headings.length; i += 1) {
        const current = headings[i];
        const next = headings[i + 1];
        const sectionEnd = next ? next.pos : docEnd;
        if (safeSelection >= current.pos && safeSelection < sectionEnd) {
            return {
                heading: current.text || "Introduction",
                content: doc.textBetween(current.end, sectionEnd, "\n").trim()
            };
        }
    }

    const lastHeading = headings[headings.length - 1];
    return {
        heading: lastHeading.text || "Introduction",
        content: doc.textBetween(lastHeading.end, docEnd, "\n").trim()
    };
};

const ToolbarButton = ({ icon, onClick, label }: { icon: React.ReactNode, onClick: () => void, label: string }) => (
    <button
        onClick={onClick}
        className="p-2 text-gray-500 hover:text-primary hover:bg-green-50 rounded-lg transition-colors"
        title={label}
        type="button"
    >
        {icon}
    </button>
);

const ModeButton = ({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${isActive ? "bg-primary text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
    >
        {label}
    </button>
);

const LineTypeButton = ({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${isActive ? "border-primary bg-green-50 text-primary" : "border-muted text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
    >
        {label}
    </button>
);
