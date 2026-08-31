export const MarkdownEditor = ({
    content,
    setContent,
    readOnly,
    onCursorChange
}: {
    content: string;
    setContent: (next: string) => void;
    readOnly: boolean;
    onCursorChange: (cursorIndex: number) => void;
}) => {
    const updateCursor = (target: HTMLTextAreaElement) => {
        onCursorChange(target.selectionStart ?? 0);
    };

    return (
        <textarea
            value={content}
            onChange={(event) => {
                if (readOnly) return;
                setContent(event.target.value);
                updateCursor(event.target);
            }}
            onSelect={(event) => updateCursor(event.target as HTMLTextAreaElement)}
            onClick={(event) => updateCursor(event.target as HTMLTextAreaElement)}
            onKeyUp={(event) => updateCursor(event.target as HTMLTextAreaElement)}
            placeholder="Start writing..."
            readOnly={readOnly}
            className="min-h-[40dvh] w-full resize-none outline-none text-lg text-text leading-relaxed placeholder:text-gray-300 break-all"
            rows={20}
        />
    );
};
