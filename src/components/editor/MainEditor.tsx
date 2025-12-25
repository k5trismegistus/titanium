import React, { useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Heading1, CheckSquare, List, Quote, Image as ImageIcon } from 'lucide-react';
import { useEditorContext } from '../../context/EditorContext';

export const MainEditor: React.FC<{ content: string; setContent: (next: string) => void; readOnly?: boolean }> = ({ content, setContent, readOnly = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { setActiveSection } = useEditorContext();
    const [cursorIndex, setCursorIndex] = useState(0);

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
        const { heading, content: sectionContent } = extractSectionAtCursor(content, cursorIndex);
        const text = [heading, sectionContent].filter(Boolean).join("\n");
        setActiveSection({ text, heading });
    }, [content, cursorIndex, setActiveSection]);

    return (
        <div className="relative w-full max-w-2xl mx-auto min-h-[calc(100vh-10rem)] bg-white pt-4">
            {!readOnly && (
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
