import React, { useState } from 'react';
import { Save, HelpCircle, Plus } from 'lucide-react';
import { MixButton } from '../mix/MixButton';
import { callMix as mix } from '../../lib/firebase/functions';
import { useAuth } from '../../lib/firebase/auth';
import { HelpModal } from './HelpModal';
import { useParams, useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';

export const Header: React.FC<{ selectedNoteIds?: string[] }> = ({ selectedNoteIds = [] }) => {
    const { user, isAllowed } = useAuth();
    const [isMixing, setIsMixing] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const { noteId: currentNoteId } = useParams<{ noteId: string }>();
    const navigate = useNavigate();

    const handleCreateNote = async () => {
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, "notes"), {
                userId: user.uid,
                markdown: "",
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
            navigate(`/note/${docRef.id}`);
        } catch (e) {
            console.error("Failed to create note:", e);
            alert("Failed to create note.");
        }
    };

    const [category, setCategory] = useState("Memo");

    const handleMix = async () => {
        if (!user) return;
        setIsMixing(true);
        try {
            // Mix: Current Note + Selected Notes
            const targetIds = [...selectedNoteIds];
            if (currentNoteId) targetIds.push(currentNoteId);

            if (targetIds.length === 0) {
                alert("Please select at least one note (or be in a note) to mix.");
                return;
            }

            const result = await mix({
                noteIds: targetIds,
                category: category
            });
            const mixedMarkdown = (result.data as any).markdown;

            if (mixedMarkdown) {
                await navigator.clipboard.writeText(mixedMarkdown);
                alert(`Mix Complete (${category})! Result copied to clipboard.`);
            }

        } catch (e) {
            console.error("Mix failed:", e);
            alert("Mix failed. See console.");
        } finally {
            setIsMixing(false);
        }
    };

    return (
        <>
            <header className="h-14 border-b border-muted flex items-center justify-between px-4 bg-white sticky top-0 z-50">
                <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate('/')}
                >
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
                        T
                    </div>
                    <span className="font-semibold text-lg tracking-tight">Titanium</span>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 flex items-center gap-1 mr-2 hidden sm:flex">
                        <Save size={14} />
                        Saved
                    </span>

                    {user && (
                        <button
                            onClick={handleCreateNote}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            <Plus size={16} />
                            <span className="hidden sm:inline">New Note</span>
                        </button>
                    )}

                    <button
                        onClick={() => setIsHelpOpen(true)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        title="Help"
                    >
                        <HelpCircle size={20} />
                    </button>

                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="text-sm border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary hidden sm:block outline-none"
                    >
                        <option value="Memo">Memo</option>
                        <option value="Blog">Blog</option>
                        <option value="Qiita">Qiita</option>
                        <option value="Twitter">Twitter</option>
                    </select>

                    <MixButton onClick={handleMix} disabled={isMixing || !isAllowed} />
                </div>
            </header>

            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </>
    );
};
