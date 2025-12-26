import React, { useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Heading1, CheckSquare, List, Quote, Image as ImageIcon } from 'lucide-react';
import { useEditorContext } from '../../context/EditorContext';

export const MainEditor: React.FC<{ content: string; setContent: (next: string) => void; readOnly?: boolean }> = ({ content, setContent, readOnly = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { setActiveSection } = useEditorContext();
    const [cursorIndex, setCursorIndex] = useState(0);
    const [editorMode, setEditorMode] = useState<"rich" | "markdown">("rich");
    const [activeLineIndex, setActiveLineIndex] = useState(0);

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
                <RichEditor
                    content={content}
                    setContent={setContent}
                    readOnly={readOnly}
                    activeLineIndex={activeLineIndex}
                    setActiveLineIndex={setActiveLineIndex}
                    onCursorIndexChange={setCursorIndex}
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

type LineKind = "heading1" | "heading2" | "heading3" | "bullet" | "task" | "quote" | "text" | "empty";

type ParsedLine = {
    kind: LineKind;
    text: string;
    prefix: string;
    checked: boolean;
};

const RichEditor = ({
    content,
    setContent,
    readOnly,
    activeLineIndex,
    setActiveLineIndex,
    onCursorIndexChange
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    activeLineIndex: number;
    setActiveLineIndex: (next: number) => void;
    onCursorIndexChange: (next: number) => void;
}) => {
    const [isToolbarVisible, setIsToolbarVisible] = useState(false);
    const lines = useMemo(() => content.split("\n"), [content]);
    const lineRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

    useEffect(() => {
        lineRefs.current = lineRefs.current.slice(0, lines.length);
        if (activeLineIndex >= lines.length) {
            setActiveLineIndex(Math.max(0, lines.length - 1));
        }
    }, [lines.length, activeLineIndex, setActiveLineIndex]);

    const activeLine = parseLine(lines[activeLineIndex] ?? "");
    const activeKind = activeLine.kind === "empty" ? "text" : activeLine.kind;

    const focusLine = (index: number, offset: number) => {
        const target = lineRefs.current[index];
        if (!target) return;
        target.focus();
        const safeOffset = Math.max(0, Math.min(offset, target.value.length));
        target.setSelectionRange(safeOffset, safeOffset);
    };

    const isAnyLineFocused = () => lineRefs.current.some((el) => el === document.activeElement);

    const handleLineBlur = () => {
        window.setTimeout(() => {
            if (!isAnyLineFocused()) {
                setIsToolbarVisible(false);
            }
        }, 0);
    };

    const computeCursorIndex = (nextLines: string[], lineIndex: number, prefixLength: number, selectionStart: number) => {
        let offset = 0;
        for (let i = 0; i < lineIndex; i += 1) {
            offset += nextLines[i].length + 1;
        }
        return Math.min(nextLines.join("\n").length, offset + prefixLength + selectionStart);
    };

    const syncCursorIndex = (lineIndex: number, parsed: ParsedLine, target: HTMLTextAreaElement, nextLines = lines) => {
        const selectionStart = target.selectionStart ?? 0;
        onCursorIndexChange(computeCursorIndex(nextLines, lineIndex, parsed.prefix.length, selectionStart));
    };

    const applyLineKind = (kind: LineKind) => {
        if (readOnly) return;
        const index = Math.min(activeLineIndex, lines.length - 1);
        const parsed = parseLine(lines[index] ?? "");
        const nextChecked = kind === "task" ? parsed.checked : false;
        const nextLines = [...lines];
        nextLines[index] = formatLine(kind, parsed.text, nextChecked);
        setContent(nextLines.join("\n"));
        const selectionStart = lineRefs.current[index]?.selectionStart ?? parsed.text.length;
        onCursorIndexChange(computeCursorIndex(nextLines, index, getPrefixForKind(kind, nextChecked).length, selectionStart));
        requestAnimationFrame(() => focusLine(index, selectionStart));
    };

    const handleLineChange = (index: number, nextValue: string, selectionStart: number | null) => {
        if (readOnly) return;
        const parsed = parseLine(lines[index] ?? "");
        const parts = nextValue.split("\n");
        const nextLines = [...lines];
        nextLines[index] = formatLine(parsed.kind, parts[0], parsed.checked);

        if (parts.length > 1) {
            const carryKind = isListLike(parsed.kind) ? parsed.kind : "text";
            const carryChecked = carryKind === "task" ? parsed.checked : false;
            const inserted = parts.slice(1).map((part) => formatLine(carryKind, part, carryChecked));
            nextLines.splice(index + 1, 0, ...inserted);
            setContent(nextLines.join("\n"));
            const lastIndex = index + parts.length - 1;
            const lastPrefix = getPrefixForKind(carryKind, carryChecked).length;
            const lastOffset = parts[parts.length - 1].length;
            setActiveLineIndex(lastIndex);
            onCursorIndexChange(computeCursorIndex(nextLines, lastIndex, lastPrefix, lastOffset));
            requestAnimationFrame(() => focusLine(lastIndex, lastOffset));
            return;
        }

        setContent(nextLines.join("\n"));
        const safeSelection = selectionStart ?? parts[0].length;
        onCursorIndexChange(computeCursorIndex(nextLines, index, parsed.prefix.length, safeSelection));
    };

    const handleLineKeyDown = (index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (readOnly) return;
        const parsed = parseLine(lines[index] ?? "");
        const selectionStart = event.currentTarget.selectionStart ?? 0;
        const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
        const hasSelection = selectionStart !== selectionEnd;
        const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;

        if (!hasModifier && !hasSelection) {
            if (event.key === "ArrowUp" && selectionStart === 0 && index > 0) {
                event.preventDefault();
                const prevParsed = parseLine(lines[index - 1] ?? "");
                setActiveLineIndex(index - 1);
                onCursorIndexChange(computeCursorIndex(lines, index - 1, prevParsed.prefix.length, prevParsed.text.length));
                requestAnimationFrame(() => focusLine(index - 1, prevParsed.text.length));
                return;
            }

            if (event.key === "ArrowDown" && selectionStart === parsed.text.length && index < lines.length - 1) {
                event.preventDefault();
                const nextParsed = parseLine(lines[index + 1] ?? "");
                setActiveLineIndex(index + 1);
                onCursorIndexChange(computeCursorIndex(lines, index + 1, nextParsed.prefix.length, 0));
                requestAnimationFrame(() => focusLine(index + 1, 0));
                return;
            }
        }

        if (event.key === "Enter") {
            event.preventDefault();

            if (isListLike(parsed.kind) && parsed.text.trim() === "") {
                const nextLines = [...lines];
                nextLines[index] = "";
                setContent(nextLines.join("\n"));
                setActiveLineIndex(index);
                onCursorIndexChange(computeCursorIndex(nextLines, index, 0, 0));
                requestAnimationFrame(() => focusLine(index, 0));
                return;
            }

            const before = parsed.text.slice(0, selectionStart);
            const after = parsed.text.slice(selectionEnd);
            const nextKind = isHeadingKind(parsed.kind) ? "text" : parsed.kind;
            const nextChecked = nextKind === "task" ? false : parsed.checked;
            const nextLines = [...lines];
            nextLines[index] = formatLine(parsed.kind, before, parsed.checked);
            nextLines.splice(index + 1, 0, formatLine(nextKind, after, nextChecked));
            setContent(nextLines.join("\n"));
            setActiveLineIndex(index + 1);
            onCursorIndexChange(computeCursorIndex(nextLines, index + 1, getPrefixForKind(nextKind, nextChecked).length, 0));
            requestAnimationFrame(() => focusLine(index + 1, 0));
        }

        if (event.key === "Backspace" && selectionStart === 0 && selectionEnd === 0 && index > 0) {
            event.preventDefault();
            const prevParsed = parseLine(lines[index - 1] ?? "");
            const merged = prevParsed.text + parsed.text;
            const nextLines = [...lines];
            nextLines[index - 1] = formatLine(prevParsed.kind, merged, prevParsed.checked);
            nextLines.splice(index, 1);
            setContent(nextLines.join("\n"));
            setActiveLineIndex(index - 1);
            onCursorIndexChange(computeCursorIndex(nextLines, index - 1, prevParsed.prefix.length, prevParsed.text.length));
            requestAnimationFrame(() => focusLine(index - 1, prevParsed.text.length));
        }
    };

    const handleTaskToggle = (index: number, nextChecked: boolean) => {
        if (readOnly) return;
        const parsed = parseLine(lines[index] ?? "");
        const nextLines = [...lines];
        nextLines[index] = formatLine("task", parsed.text, nextChecked);
        setContent(nextLines.join("\n"));
        const selectionStart = lineRefs.current[index]?.selectionStart ?? 0;
        onCursorIndexChange(computeCursorIndex(nextLines, index, getPrefixForKind("task", nextChecked).length, selectionStart));
        requestAnimationFrame(() => focusLine(index, selectionStart));
    };

    return (
        <div className="space-y-4 pb-24">
            {!readOnly && isToolbarVisible && (
                <div
                    className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-muted bg-white/95 px-3 py-2 text-sm shadow-md backdrop-blur max-w-[calc(100vw-2rem)] overflow-x-auto whitespace-nowrap"
                    style={{ bottom: "calc(1rem + var(--keyboard-offset, 0px) + env(safe-area-inset-bottom))" }}
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <LineTypeButton label="Text" isActive={activeKind === "text"} onClick={() => applyLineKind("text")} />
                    <LineTypeButton label="H1" isActive={activeKind === "heading1"} onClick={() => applyLineKind("heading1")} />
                    <LineTypeButton label="H2" isActive={activeKind === "heading2"} onClick={() => applyLineKind("heading2")} />
                    <LineTypeButton label="H3" isActive={activeKind === "heading3"} onClick={() => applyLineKind("heading3")} />
                    <LineTypeButton label="List" isActive={activeKind === "bullet"} onClick={() => applyLineKind("bullet")} />
                    <LineTypeButton label="Task" isActive={activeKind === "task"} onClick={() => applyLineKind("task")} />
                    <LineTypeButton label="Quote" isActive={activeKind === "quote"} onClick={() => applyLineKind("quote")} />
                </div>
            )}

            <div className="space-y-2">
                {lines.map((line, index) => {
                    const parsed = parseLine(line);
                    const isActive = index === activeLineIndex;
                    const lineClass = getLineTextClass(parsed.kind);
                    const wrapClass = [
                        "flex w-full items-start gap-3 rounded-lg px-2 py-1",
                        parsed.kind === "quote" ? "border-l-2 border-gray-200 pl-3" : "",
                        isActive && !readOnly ? "bg-green-50/60" : ""
                    ].join(" ");

                    return (
                        <div key={`line-${index}`} className={wrapClass}>
                            {parsed.kind === "bullet" && (
                                <span className="mt-2 text-gray-400">&bull;</span>
                            )}
                            {parsed.kind === "task" && (
                                <input
                                    type="checkbox"
                                    checked={parsed.checked}
                                    disabled={readOnly}
                                    onChange={(e) => handleTaskToggle(index, e.target.checked)}
                                    className="mt-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                            )}
                            <TextareaAutosize
                                ref={(el) => {
                                    lineRefs.current[index] = el;
                                }}
                                value={parsed.text}
                                readOnly={readOnly}
                                minRows={1}
                                placeholder={index === 0 ? "Start writing..." : undefined}
                                className={lineClass}
                                onChange={(e) => handleLineChange(index, e.target.value, e.target.selectionStart)}
                                onKeyDown={(e) => handleLineKeyDown(index, e)}
                                onFocus={(e) => {
                                    setActiveLineIndex(index);
                                    setIsToolbarVisible(true);
                                    syncCursorIndex(index, parsed, e.currentTarget);
                                }}
                                onBlur={handleLineBlur}
                                onClick={(e) => syncCursorIndex(index, parsed, e.currentTarget)}
                                onSelect={(e) => syncCursorIndex(index, parsed, e.currentTarget)}
                                onKeyUp={(e) => syncCursorIndex(index, parsed, e.currentTarget)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const parseLine = (line: string): ParsedLine => {
    if (line.trim() === "") {
        return { kind: "empty", text: "", prefix: "", checked: false };
    }

    const heading3 = line.match(/^###\s+(.*)$/);
    if (heading3) {
        return { kind: "heading3", text: heading3[1], prefix: "### ", checked: false };
    }

    const heading2 = line.match(/^##\s+(.*)$/);
    if (heading2) {
        return { kind: "heading2", text: heading2[1], prefix: "## ", checked: false };
    }

    const heading1 = line.match(/^#\s+(.*)$/);
    if (heading1) {
        return { kind: "heading1", text: heading1[1], prefix: "# ", checked: false };
    }

    const task = line.match(/^- \[([ xX])\]\s+(.*)$/);
    if (task) {
        const checked = task[1].toLowerCase() === "x";
        return { kind: "task", text: task[2], prefix: getPrefixForKind("task", checked), checked };
    }

    const bullet = line.match(/^- \s*(.*)$/);
    if (bullet) {
        return { kind: "bullet", text: bullet[1], prefix: "- ", checked: false };
    }

    const quote = line.match(/^>\s+(.*)$/);
    if (quote) {
        return { kind: "quote", text: quote[1], prefix: "> ", checked: false };
    }

    return { kind: "text", text: line, prefix: "", checked: false };
};

const formatLine = (kind: LineKind, text: string, checked = false) => {
    return `${getPrefixForKind(kind, checked)}${text}`;
};

const getPrefixForKind = (kind: LineKind, checked = false) => {
    switch (kind) {
        case "heading1":
            return "# ";
        case "heading2":
            return "## ";
        case "heading3":
            return "### ";
        case "bullet":
            return "- ";
        case "task":
            return `- [${checked ? "x" : " "}] `;
        case "quote":
            return "> ";
        default:
            return "";
    }
};

const isHeadingKind = (kind: LineKind) => kind === "heading1" || kind === "heading2" || kind === "heading3";

const isListLike = (kind: LineKind) => kind === "bullet" || kind === "task" || kind === "quote";

const getLineTextClass = (kind: LineKind) => {
    const base = "w-full resize-none bg-transparent outline-none leading-relaxed placeholder:text-gray-300 break-all";
    if (kind === "heading1") return `${base} text-3xl font-semibold text-gray-900`;
    if (kind === "heading2") return `${base} text-2xl font-semibold text-gray-900`;
    if (kind === "heading3") return `${base} text-xl font-semibold text-gray-900`;
    if (kind === "quote") return `${base} text-base italic text-gray-700`;
    return `${base} text-lg text-text`;
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
