import React from 'react';
import { useEditorContext } from '../../context/EditorContext';
import { RichTextEditor } from './RichTextEditor';

export const MainEditor: React.FC<{
    content: string;
    setContent: (next: string) => void;
    readOnly?: boolean;
    canUseAI?: boolean;
}> = ({ content, setContent, readOnly = false, canUseAI = true }) => {
    const { setActiveSection } = useEditorContext();

    return (
        <div className="relative w-full max-w-2xl mx-auto min-h-[calc(100svh-10rem)] bg-white pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-12">
            <RichTextEditor
                content={content}
                setContent={setContent}
                readOnly={readOnly}
                canUseAI={canUseAI}
                setActiveSection={setActiveSection}
            />
        </div>
    );
};
