import React from 'react';
import { SuggestRail } from '../suggestions/SuggestRail';
import type { DemoSuggestionMap } from '../suggestions/SuggestRail';
import type { MixSelectableNote } from '../suggestions/SuggestRail';
import { EditorProvider } from '../../context/EditorContext';

type MainLayoutProps = {
    children: React.ReactNode;
    editorHeader?: React.ReactNode;
    selectedNotes: MixSelectableNote[];
    onToggleNote: (note: MixSelectableNote) => void;
    currentNoteMarkdown?: string;
    demoSuggestions?: DemoSuggestionMap;
    mixCategory?: string;
    onChangeMixCategory?: (next: string) => void;
    categories?: string[];
    onAddCategory?: (next: string) => void;
    onMix?: () => void;
    isMixing?: boolean;
    isMixAllowed?: boolean;
};

export const MainLayout = ({
    children,
    editorHeader,
    selectedNotes,
    onToggleNote,
    currentNoteMarkdown,
    demoSuggestions,
    mixCategory,
    onChangeMixCategory,
    categories,
    onAddCategory,
    onMix,
    isMixing,
    isMixAllowed
}: MainLayoutProps) => {
    return (
    <EditorProvider>
            <div
                className="min-h-[100svh] bg-white"
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
                <div className="flex min-h-[calc(100svh-3.5rem)] items-start">
                    <main className="min-w-0 flex-1 px-4 py-8 pr-12 lg:pr-8">
                        {children}
                    </main>
                    <aside className="shrink-0">
                        <SuggestRail
                            selectedNotes={selectedNotes}
                            onToggleNote={onToggleNote}
                            currentNoteMarkdown={currentNoteMarkdown}
                            demoSuggestions={demoSuggestions}
                            mixCategory={mixCategory}
                            onChangeMixCategory={onChangeMixCategory}
                            categories={categories}
                            onAddCategory={onAddCategory}
                            onMix={onMix}
                            isMixing={isMixing}
                            isMixAllowed={isMixAllowed}
                        />
                    </aside>
                </div>
            </div>
        </EditorProvider>
    );
};
