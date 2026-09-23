import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type EditorContextValue = {
    activeSectionText: string;
    activeSectionHeading: string;
    setActiveSection: (next: { text: string; heading: string }) => void;
    isTextSelected: boolean;
    isKeyboardOpen: boolean;
    setEditorInteraction: (next: Partial<EditorInteraction>) => void;
};

type EditorInteraction = {
    isTextSelected: boolean;
    isKeyboardOpen: boolean;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeSectionText, setActiveSectionText] = useState('');
    const [activeSectionHeading, setActiveSectionHeading] = useState('');
    const [interaction, setInteraction] = useState<EditorInteraction>({
        isTextSelected: false,
        isKeyboardOpen: false,
    });
    const setActiveSection = useCallback(({ text, heading }: { text: string; heading: string }) => {
        setActiveSectionText(text);
        setActiveSectionHeading(heading);
    }, []);
    const setEditorInteraction = useCallback((next: Partial<EditorInteraction>) => {
        setInteraction((previous) => {
            if (
                Object.entries(next).every(
                    ([key, value]) => previous[key as keyof EditorInteraction] === value,
                )
            ) {
                return previous;
            }
            return { ...previous, ...next };
        });
    }, []);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const preview = activeSectionText.slice(0, 50);
        console.log(`[editor] active section heading="${activeSectionHeading}" text="${preview}"`);
    }, [activeSectionText, activeSectionHeading]);

    const value = useMemo<EditorContextValue>(
        () => ({
            activeSectionText,
            activeSectionHeading,
            setActiveSection,
            ...interaction,
            setEditorInteraction,
        }),
        [
            activeSectionText,
            activeSectionHeading,
            interaction,
            setActiveSection,
            setEditorInteraction,
        ],
    );

    return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export const useEditorContext = () => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditorContext must be used within EditorProvider');
    }
    return context;
};
