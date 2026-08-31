import React, { useEffect, useState } from 'react';
import { useEditorContext } from '../../context/EditorContext';
import { ModeButton } from './EditorToolbar';
import { extractSectionAtCursor } from './editorSections';
import { MarkdownEditor } from './MarkdownEditor';
import { RichTextEditor } from './RichTextEditor';

export const MainEditor: React.FC<{ content: string; setContent: (next: string) => void; readOnly?: boolean }> = ({ content, setContent, readOnly = false }) => {
    const { setActiveSection } = useEditorContext();
    const [cursorIndex, setCursorIndex] = useState(0);
    const [editorMode, setEditorMode] = useState<"rich" | "markdown">("rich");

    useEffect(() => {
        if (editorMode !== "markdown") return;
        const { heading, content: sectionContent } = extractSectionAtCursor(content, cursorIndex);
        const text = [heading, sectionContent].filter(Boolean).join("\n");
        setActiveSection({ text, heading });
    }, [content, cursorIndex, editorMode, setActiveSection]);

    return (
        <div className="relative w-full max-w-2xl mx-auto min-h-[calc(100svh-10rem)] bg-white pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-12">
            <div className="mb-3 flex items-center justify-end">
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50/70 p-0.5 text-xs">
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

            {editorMode === "markdown" ? (
                <MarkdownEditor
                    content={content}
                    setContent={setContent}
                    readOnly={readOnly}
                    onCursorChange={setCursorIndex}
                />
            ) : (
                <RichTextEditor
                    content={content}
                    setContent={setContent}
                    readOnly={readOnly}
                    setActiveSection={setActiveSection}
                />
            )}
        </div>
    );
};
