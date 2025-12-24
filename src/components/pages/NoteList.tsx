import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Calendar } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/firebase/auth';

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
                    collection(db, "notes"),
                    where("userId", "==", user.uid),
                    orderBy("updatedAt", "desc")
                );
                const snapshot = await getDocs(q);
                const loadedNotes = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Note[];
                setNotes(loadedNotes);
            } catch (e) {
                console.error("Failed to fetch notes:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchNotes();
    }, [user]);

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
            alert("Failed to create note. Ensure you are whitelisted.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    Your Notes
                </h1>
                <button
                    onClick={handleCreateNote}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-full shadow hover:bg-green-600 transition-all hover:scale-105 active:scale-95"
                >
                    <Plus size={18} />
                    New Note
                </button>
            </header>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : !user ? (
                <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-200 p-6">
                    <h3 className="text-red-700 font-bold mb-2">Authentication Failed</h3>
                    <p className="text-red-600 mb-4">Could not sign in to Firebase.</p>
                    <ul className="text-left text-sm text-red-500 max-w-md mx-auto list-disc pl-5 space-y-1">
                        <li>Check if <b>Authentication (Anonymous)</b> is enabled in Firebase Console.</li>
                        <li>Check if your <b>.env</b> file has the correct API keys.</li>
                    </ul>
                </div>
            ) : notes.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-gray-500 mb-4">No notes yet. Start writing something amazing!</p>
                    <button onClick={handleCreateNote} className="text-primary font-medium hover:underline">
                        Create your first note
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {notes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => navigate(`/note/${note.id}`)}
                            className="group bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer flex flex-col h-48"
                        >
                            <div className="flex-1 overflow-hidden">
                                <div className="flex items-start justify-between mb-2">
                                    <FileText size={16} className="text-gray-300 group-hover:text-primary transition-colors" />
                                </div>
                                <p className="text-gray-800 font-medium line-clamp-3">
                                    {note.markdown.slice(0, 100) || "Empty Note"}
                                </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-400">
                                <Calendar size={12} />
                                {note.updatedAt?.toDate().toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
