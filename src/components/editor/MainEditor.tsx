import React, { useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Heading1, CheckSquare, List, Quote, Loader2, Image as ImageIcon } from 'lucide-react';
import { useSync } from '../../hooks/useSync';

export const MainEditor: React.FC<{ noteId?: string }> = ({ noteId = "scratchpad" }) => {
    const { content, setContent, isSaving } = useSync(noteId, "");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertText = (before: string, after: string = "") => {
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

    return (
        <div className="relative w-full max-w-2xl mx-auto min-h-[calc(100vh-10rem)] bg-white">
            {/* Saving Indicator */}
            <div className={`fixed top-16 right-4 z-50 transition-opacity ${isSaving ? 'opacity-100' : 'opacity-0'}`}>
                <Loader2 className="animate-spin text-primary" size={20} />
            </div>

            {/* Floating Toolbar (Mobile friendly) */}
            <div className="sticky top-16 z-40 bg-white/80 backdrop-blur-sm py-2 px-2 mb-4 rounded-xl border border-muted shadow-sm flex gap-2 w-max mx-auto transition-all opacity-0 hover:opacity-100 focus-within:opacity-100">
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

            <TextareaAutosize
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start writing..."
                className="w-full resize-none outline-none text-lg text-text leading-relaxed placeholder:text-gray-300"
                minRows={20}
            />
        </div>
    );
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
