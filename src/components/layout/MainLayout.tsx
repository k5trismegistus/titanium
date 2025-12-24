import React from 'react';
import { SuggestRail } from '../suggestions/SuggestRail';
import type { DemoSuggestionMap } from '../suggestions/SuggestRail';
import { EditorProvider } from '../../context/EditorContext';

type MainLayoutProps = {
    children: React.ReactNode;
    editorHeader?: React.ReactNode;
    selectedNoteIds: string[];
    onToggleNote: (id: string) => void;
    demoSuggestions?: DemoSuggestionMap;
};

export const MainLayout = ({ children, editorHeader, selectedNoteIds, onToggleNote, demoSuggestions }: MainLayoutProps) => {
    return (
        <EditorProvider>
            <div
                className="min-h-screen bg-white"
                style={{
                    ["--global-header-height" as string]: "3.5rem",
                    ["--editor-header-height" as string]: editorHeader ? "3rem" : "0px"
                }}
            >
                {editorHeader && (
                    <div className="sticky top-14 z-40 border-b border-muted bg-white/95 backdrop-blur">
                        {editorHeader}
                    </div>
                )}
                <div className="flex min-h-[calc(100vh-3.5rem)]">
                    <main className="flex-1 px-4 py-8 pr-12 lg:pr-80">
                        {children}
                    </main>
                    <div>
                        <SuggestRail selectedNoteIds={selectedNoteIds} onToggleNote={onToggleNote} demoSuggestions={demoSuggestions} />
                    </div>
                </div>
            </div>
        </EditorProvider>
    );
};
