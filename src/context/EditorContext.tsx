import React, { createContext, useContext, useMemo, useState } from "react";

type EditorContextValue = {
    activeSectionText: string;
    activeSectionHeading: string;
    setActiveSection: (next: { text: string; heading: string }) => void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeSectionText, setActiveSectionText] = useState("");
    const [activeSectionHeading, setActiveSectionHeading] = useState("");

    const value = useMemo<EditorContextValue>(() => ({
        activeSectionText,
        activeSectionHeading,
        setActiveSection: ({ text, heading }) => {
            setActiveSectionText(text);
            setActiveSectionHeading(heading);
        }
    }), [activeSectionText, activeSectionHeading]);

    return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export const useEditorContext = () => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error("useEditorContext must be used within EditorProvider");
    }
    return context;
};
