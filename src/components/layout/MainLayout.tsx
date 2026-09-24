import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { SuggestRail } from '../suggestions/SuggestRail';
import type { DemoSuggestionMap } from '../suggestions/SuggestRail';
import type { MixSelectableNote } from '../suggestions/SuggestRail';
import { EditorProvider } from '../../context/EditorContext';
import { useVisualViewportTop } from '../../hooks/useVisualViewportTop';

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
    isMixAllowed,
}: MainLayoutProps) => {
    useVisualViewportTop();
    const [isSuggestOpen, setIsSuggestOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 1024;
    });

    return (
        <EditorProvider>
            <div
                className="min-h-[100svh] bg-white"
                style={{
                    ['--global-header-height' as string]: '3.5rem',
                    ['--editor-header-height' as string]: editorHeader ? '3rem' : '0px',
                }}
            >
                {editorHeader && (
                    <div className="relative z-40 flex items-center border-b border-muted bg-white/95 backdrop-blur">
                        <div className="min-w-0 flex-1">{editorHeader}</div>
                        <button
                            type="button"
                            onClick={() => setIsSuggestOpen(true)}
                            className="mr-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-primary hover:bg-emerald-100 lg:hidden"
                            aria-label="Open related thoughts"
                            title="Open related thoughts"
                        >
                            <Lightbulb size={14} />
                        </button>
                    </div>
                )}
                {/* Keep toolbar sticky scopes outside the editor content. */}
                <div
                    id="titanium-mobile-editor-toolbar"
                    className="sticky z-30 lg:hidden"
                    style={{ top: 'var(--visual-viewport-top, 0px)' }}
                />
                <div className="flex min-h-[calc(100svh-3.5rem)] items-start">
                    <main className="min-w-0 flex-1 px-4 py-8 lg:pr-8">
                        <div
                            id="titanium-desktop-editor-toolbar"
                            className="sticky z-30 mx-auto hidden max-w-2xl lg:block"
                            style={{ top: 'var(--visual-viewport-top, 0px)' }}
                        />
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
                            isOpen={isSuggestOpen}
                            onOpenChange={setIsSuggestOpen}
                        />
                    </aside>
                </div>
            </div>
        </EditorProvider>
    );
};
