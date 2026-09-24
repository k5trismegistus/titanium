import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Calendar, Loader2, Trash2 } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/firebase/auth';
import { searchNotes } from '../../lib/firebase/functions';

interface Note {
    id: string;
    markdown: string;
    updatedAt: any;
}

export const NoteList: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notes, setNotes] = useState<Note[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Note[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

    useEffect(() => {
        // If user is null, it means AuthProvider finished loading but no user was found (Auth failed)
        // We should stop loading and show a state.
        if (!user) {
            setIsLoading(false);
            return;
        }

        const fetchNotes = async () => {
            try {
                // Initial load query
                const q = query(
                    collection(db, 'notes'),
                    where('userId', '==', user.uid),
                    orderBy('updatedAt', 'desc'),
                );
                const snapshot = await getDocs(q);
                const loadedNotes = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                })) as Note[];
                setNotes(loadedNotes);
            } catch (e) {
                console.error('Failed to fetch notes:', e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchNotes();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        let isActive = true;
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const result = await searchNotes({ queryText: trimmed, limit: 5 });
                if (!isActive) return;
                const nextResults = (result.data.results || []).map((doc: any) => ({
                    id: doc.id,
                    markdown: doc.markdown || '',
                    updatedAt: doc.date,
                }));
                setSearchResults(nextResults);
            } catch (e) {
                console.error('Search failed:', e);
                if (isActive) {
                    setSearchResults([]);
                }
            } finally {
                if (isActive) {
                    setIsSearching(false);
                }
            }
        }, 500);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [searchQuery, user]);

    const handleDeleteNote = async (noteId: string) => {
        if (!user || deletingNoteId) return;
        const shouldDelete = window.confirm('Delete this note? This action cannot be undone.');
        if (!shouldDelete) return;

        setDeletingNoteId(noteId);
        try {
            await deleteDoc(doc(db, 'notes', noteId));
            setNotes((prev) => prev.filter((item) => item.id !== noteId));
            setSearchResults((prev) => prev.filter((item) => item.id !== noteId));
        } catch (e) {
            console.error('Failed to delete note:', e);
            alert('Failed to delete note.');
        } finally {
            setDeletingNoteId(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-[100dvh]">
            <header className="mb-8">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    Your Notes
                </h1>
            </header>

            <div className="mb-6">
                <label className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                    Search
                </label>
                <div className="mt-2 flex items-center gap-2">
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search notes by meaning..."
                        className="w-full max-w-md text-base border border-gray-200 bg-white rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
                    />
                    {searchQuery.trim() && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600"
                            type="button"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : !user ? (
                <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-200 p-6">
                    <h3 className="text-red-700 font-bold mb-2">Authentication Failed</h3>
                    <p className="text-red-600 mb-4">Could not sign in to Firebase.</p>
                    <ul className="text-left text-sm text-red-500 max-w-md mx-auto list-disc pl-5 space-y-1">
                        <li>
                            Check if <b>Authentication (Anonymous)</b> is enabled in Firebase
                            Console.
                        </li>
                        <li>
                            Check if your <b>.env</b> file has the correct API keys.
                        </li>
                    </ul>
                </div>
            ) : searchQuery.trim() ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>Top matches</span>
                        <span className="text-xs text-gray-400">Vector search</span>
                    </div>
                    {isSearching ? (
                        <div className="text-gray-400 text-sm text-center py-6">Searching...</div>
                    ) : searchResults.length === 0 ? (
                        <div className="text-gray-400 text-sm text-center py-6">
                            No similar notes found.
                        </div>
                    ) : (
                        searchResults.map((note) => (
                            <div
                                key={`search-${note.id}`}
                                onClick={() => navigate(`/note/${note.id}`)}
                                className="group bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
                            >
                                <div className="flex items-start gap-3">
                                    <FileText
                                        size={16}
                                        className="text-gray-300 group-hover:text-primary transition-colors"
                                    />
                                    <div className="flex-1">
                                        <div className="mb-1 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void handleDeleteNote(note.id);
                                                }}
                                                disabled={deletingNoteId === note.id}
                                                className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                                                aria-label="Delete note"
                                                title="Delete note"
                                            >
                                                {deletingNoteId === note.id ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Trash2 size={14} />
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-gray-800 font-medium line-clamp-2">
                                            {note.markdown.slice(0, 120) || 'Empty Note'}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                                            <Calendar size={12} />
                                            {toDateSafe(note.updatedAt)?.toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : notes.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-gray-500">
                        No notes yet. Use + in the header to create one.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {notes.map((note) => (
                        <div
                            key={note.id}
                            onClick={() => navigate(`/note/${note.id}`)}
                            className="group bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer flex flex-col h-48"
                        >
                            <div className="flex-1 overflow-hidden">
                                <div className="flex items-start justify-between mb-2">
                                    <FileText
                                        size={16}
                                        className="text-gray-300 group-hover:text-primary transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            void handleDeleteNote(note.id);
                                        }}
                                        disabled={deletingNoteId === note.id}
                                        className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                                        aria-label="Delete note"
                                        title="Delete note"
                                    >
                                        {deletingNoteId === note.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={14} />
                                        )}
                                    </button>
                                </div>
                                <p className="text-gray-800 font-medium line-clamp-3">
                                    {note.markdown.slice(0, 100) || 'Empty Note'}
                                </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-400">
                                <Calendar size={12} />
                                {toDateSafe(note.updatedAt)?.toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const toDateSafe = (value: any): Date | undefined => {
    if (!value) return undefined;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    return undefined;
};
