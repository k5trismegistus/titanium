import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '../layout/MainLayout';
import { MainEditor } from '../editor/MainEditor';
import { useSync } from '../../hooks/useSync';
import { useUserCategories } from '../../hooks/useUserCategories';
import { EditorHeader, SaveStatus } from '../editor/EditorHeader';
import { useAuth } from '../../lib/firebase/auth';
import { callMix as mix } from '../../lib/firebase/functions';
import { addDoc, collection, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { copyTextToClipboard } from '../../lib/clipboard';
import { X } from 'lucide-react';
import type { MixSelectableNote } from '../suggestions/SuggestRail';

export const NoteEditorPage: React.FC = () => {
    const { noteId } = useParams<{ noteId: string }>();
    const resolvedNoteId = noteId || "scratchpad";
    const { user, isAllowed } = useAuth();
    const navigate = useNavigate();
    const [selectedNotes, setSelectedNotes] = useState<MixSelectableNote[]>([]);
    const [isMixing, setIsMixing] = useState(false);
    const [mixResult, setMixResult] = useState("");
    const [isMixModalOpen, setIsMixModalOpen] = useState(false);
    const [isSavingMix, setIsSavingMix] = useState(false);
    const [isDeletingNote, setIsDeletingNote] = useState(false);

    const { categories, addCategory, isLoading: isCategoriesLoading } = useUserCategories();
    const defaultCategory = categories[0] || "Memo";
    const [mixCategory, setMixCategory] = useState(defaultCategory);
    const [mixCategoryTouched, setMixCategoryTouched] = useState(false);
    const { content, setContent, isSaving, category, setCategory, lastSavedContent, lastSavedCategory } = useSync(resolvedNoteId, "", defaultCategory);
    const hasUnsavedChanges = content !== lastSavedContent || category !== lastSavedCategory;
    const saveStatus: SaveStatus = isSaving ? "saving" : hasUnsavedChanges ? "dirty" : "saved";
    useEffect(() => {
        if (isCategoriesLoading) return;
        if (!lastSavedCategory) return;
        void addCategory(lastSavedCategory);
    }, [lastSavedCategory, addCategory, isCategoriesLoading]);

    useEffect(() => {
        setMixCategoryTouched(false);
    }, [resolvedNoteId]);

    useEffect(() => {
        if (!mixCategoryTouched) {
            setMixCategory(category || defaultCategory);
        }
    }, [category, defaultCategory, mixCategoryTouched]);

    const toggleNote = (note: MixSelectableNote) => {
        setSelectedNotes(prev =>
            prev.some((item) => item.id === note.id)
                ? prev.filter(item => item.id !== note.id)
                : [...prev, note]
        );
    };

    const handleMix = async () => {
        if (!user) return;
        setIsMixing(true);
        try {
            const targetIds = selectedNotes.map((note) => note.id);
            const resolvedId = resolvedNoteId === "scratchpad" ? `scratchpad-${user.uid}` : resolvedNoteId;
            if (resolvedId) targetIds.push(resolvedId);

            const uniqueIds = Array.from(new Set(targetIds));
            if (uniqueIds.length === 0) {
                alert("Please select at least one note (or be in a note) to mix.");
                return;
            }

            const result = await mix({
                noteIds: uniqueIds,
                category: mixCategory,
                baseNoteId: resolvedId
            });
            const mixedMarkdown = (result.data as any).markdown;

            if (mixedMarkdown) {
                setMixResult(mixedMarkdown);
                setIsMixModalOpen(true);
            }
        } catch (e) {
            console.error("Mix failed:", e);
            alert("Mix failed. See console.");
        } finally {
            setIsMixing(false);
        }
    };

    const handleSaveMix = async () => {
        if (!user || !mixResult) return;
        setIsSavingMix(true);
        try {
            const docRef = await addDoc(collection(db, "notes"), {
                userId: user.uid,
                markdown: mixResult,
                category: mixCategory,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
            setIsMixModalOpen(false);
            setMixResult("");
            navigate(`/note/${docRef.id}`);
        } catch (e) {
            console.error("Failed to save mixed note:", e);
            alert("Failed to save mixed note.");
        } finally {
            setIsSavingMix(false);
        }
    };

    const handleDeleteNote = async () => {
        if (!user || isDeletingNote) return;
        const docId = resolvedNoteId === "scratchpad" ? `scratchpad-${user.uid}` : resolvedNoteId;
        if (!docId) return;

        const shouldDelete = window.confirm("Delete this note? This action cannot be undone.");
        if (!shouldDelete) return;

        setIsDeletingNote(true);
        try {
            await deleteDoc(doc(db, "notes", docId));
            navigate("/");
        } catch (e) {
            console.error("Failed to delete note:", e);
            alert("Failed to delete note.");
        } finally {
            setIsDeletingNote(false);
        }
    };

    const handleCopyNote = async () => {
        try {
            await copyTextToClipboard(content);
        } catch (e) {
            console.error("Failed to copy note:", e);
            alert("Failed to copy note.");
        }
    };

    return (
        <>
            <MainLayout
                editorHeader={
                    <EditorHeader
                        saveStatus={saveStatus}
                        category={category}
                        setCategory={setCategory}
                        categories={categories}
                        onAddCategory={(next) => {
                            void addCategory(next);
                        }}
                        onCopyNote={handleCopyNote}
                        onDeleteNote={handleDeleteNote}
                        isDeletingNote={isDeletingNote}
                    />
                }
                selectedNotes={selectedNotes}
                onToggleNote={toggleNote}
                currentNoteMarkdown={content}
                mixCategory={mixCategory}
                onChangeMixCategory={(next) => {
                    setMixCategoryTouched(true);
                    setMixCategory(next);
                }}
                categories={categories}
                onAddCategory={(next) => {
                    void addCategory(next);
                }}
                onMix={handleMix}
                isMixing={isMixing}
                isMixAllowed={!!isAllowed}
            >
                <MainEditor content={content} setContent={setContent} />
            </MainLayout>

            {isMixModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-muted px-5 py-3">
                            <div className="text-sm font-semibold text-gray-800">Mix Result</div>
                            <button
                                onClick={() => setIsMixModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-[60dvh] overflow-y-auto px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap">
                            {mixResult}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-muted px-5 py-3">
                            <button
                                onClick={() => setIsMixModalOpen(false)}
                                className="text-sm text-gray-500 hover:text-gray-700"
                                type="button"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSaveMix}
                                className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-60"
                                disabled={isSavingMix || !mixResult}
                                type="button"
                            >
                                {isSavingMix ? "Saving..." : "Save as new note"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
