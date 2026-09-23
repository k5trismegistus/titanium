import React, { useState } from 'react';
import { HelpCircle, Plus, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/firebase/auth';
import { HelpModal } from './HelpModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useUserCategories } from '../../hooks/useUserCategories';
import { callQuickWord } from '../../lib/firebase/functions';

export const Header: React.FC = () => {
    const { user, isAllowed } = useAuth();
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isQuickWordOpen, setIsQuickWordOpen] = useState(false);
    const [quickWord, setQuickWord] = useState('');
    const [isQuickWordSaving, setIsQuickWordSaving] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const isDemoRoute = location.pathname === '/demo';
    const { categories } = useUserCategories();
    const defaultCategory = categories[0] || 'Memo';

    const handleCreateNote = async () => {
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, 'notes'), {
                userId: user.uid,
                markdown: '',
                category: defaultCategory,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            });
            navigate(`/note/${docRef.id}`);
        } catch (e) {
            console.error('Failed to create note:', e);
            alert('Failed to create note.');
        }
    };

    const handleQuickWordSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user || !isAllowed) return;
        const trimmed = quickWord.trim();
        if (!trimmed) return;
        setIsQuickWordSaving(true);
        try {
            const result = await callQuickWord({ word: trimmed, category: defaultCategory });
            const noteId = result.data.noteId;
            setQuickWord('');
            setIsQuickWordOpen(false);
            if (noteId) {
                navigate(`/note/${noteId}`);
            }
        } catch (e) {
            console.error('Quick Word failed:', e);
            alert('Quick Word failed. See console.');
        } finally {
            setIsQuickWordSaving(false);
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
                    {user && isAllowed && (
                        <div className="relative">
                            <button
                                onClick={() => setIsQuickWordOpen((prev) => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                type="button"
                            >
                                <Sparkles size={16} />
                                <span className="hidden sm:inline">Quick Word</span>
                            </button>
                            {isQuickWordOpen && (
                                <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                                    <form
                                        onSubmit={handleQuickWordSubmit}
                                        className="flex items-center gap-2"
                                    >
                                        <input
                                            value={quickWord}
                                            onChange={(e) => setQuickWord(e.target.value)}
                                            placeholder="Enter a term..."
                                            className="w-full text-base border border-gray-200 bg-white rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none"
                                            autoFocus
                                        />
                                        <button
                                            type="submit"
                                            disabled={isQuickWordSaving || !quickWord.trim()}
                                            className="text-xs font-medium bg-primary text-white px-3 py-2 rounded-lg disabled:opacity-50"
                                        >
                                            {isQuickWordSaving ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                'Save'
                                            )}
                                        </button>
                                    </form>
                                    <p className="mt-2 text-xs text-gray-400">
                                        Auto-generates a reference note for future Mix suggestions.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    {(user || isDemoRoute) && (
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
                </div>
            </header>

            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </>
    );
};
