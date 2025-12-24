import React from 'react';
import { Header } from '../common/Header';
import { SuggestRail } from '../suggestions/SuggestRail';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    const [selectedNoteIds, setSelectedNoteIds] = React.useState<string[]>([]);

    const toggleNote = (id: string) => {
        setSelectedNoteIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    return (
        <div className="min-h-screen bg-white">
            <Header selectedNoteIds={selectedNoteIds} />
            <div className="flex">
                <main className="flex-1 px-4 py-8 lg:pr-80 min-h-[calc(100vh-3.5rem)]">
                    {children}
                </main>
                <SuggestRail selectedNoteIds={selectedNoteIds} onToggleNote={toggleNote} />
            </div>
        </div>
    );
};
