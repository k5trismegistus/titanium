import React, { useState, useEffect } from 'react';
import { Lightbulb, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { searchRelated } from '../../lib/firebase/functions';
import { useAuth } from '../../lib/firebase/auth';
import { useParams } from 'react-router-dom';

interface SuggestRailProps {
    selectedNoteIds: string[];
    onToggleNote: (id: string) => void;
}

export const SuggestRail: React.FC<SuggestRailProps> = ({ selectedNoteIds, onToggleNote }) => {
    const { user } = useAuth();
    const { noteId: currentId } = useParams<{ noteId: string }>();
    const [isOpen, setIsOpen] = useState(true);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) return;

        const fetchSuggestions = async () => {
            setLoading(true);
            try {
                if (!currentId) {
                    // Fallback to recent notes if no current note (e.g. on home, though this rail might not be visible)
                    const q = query(
                        collection(db, "notes"),
                        where("userId", "==", user.uid),
                        orderBy("updatedAt", "desc"),
                        limit(10)
                    );
                    const snap = await getDocs(q);
                    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setSuggestions(notes);
                    return;
                }

                // Call Vector Search
                const result = await searchRelated({ noteId: currentId });
                const relatedNotes = result.data.results.map((r: any) => ({
                    id: r.id,
                    markdown: r.markdown,
                    updatedAt: r.date ? new Date(r.date._seconds * 1000) : new Date(), // Handle Firestore timestamp shim
                    score: r.score
                }));

                setSuggestions(relatedNotes);
            } catch (e) {
                console.error("Failed to fetch suggestions:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestions();
    }, [user, currentId]);

    return (
        <div
            className={`
        fixed right-0 top-14 bottom-0 bg-gray-50 border-l border-muted transition-all duration-300 ease-in-out z-20
        ${isOpen ? 'w-80 translate-x-0' : 'w-12 translate-x-0'}
      `}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="absolute -left-3 top-4 bg-white border border-muted rounded-full p-1 shadow-sm text-gray-400 hover:text-primary z-30"
            >
                {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {isOpen ? (
                <div className="p-4 h-full overflow-y-auto">
                    <div className="flex items-center gap-2 mb-6 text-gray-500 text-sm font-medium">
                        <Lightbulb size={16} />
                        <span>Related Thoughts</span>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            <div className="text-gray-400 text-xs text-center py-4">Finding connections...</div>
                        ) : suggestions.length === 0 ? (
                            <div className="text-gray-400 text-xs text-center py-4">No other notes found.</div>
                        ) : (
                            suggestions.map(note => (
                                <SuggestItem
                                    key={note.id}
                                    title={note.markdown.slice(0, 50) || "Untitled Note"}
                                    date={note.updatedAt?.toDate()}
                                    checked={selectedNoteIds.includes(note.id)}
                                    onToggle={() => onToggleNote(note.id)}
                                    score={note.score}
                                />
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center pt-6 gap-4">
                    <Lightbulb size={20} className="text-gray-400" />
                </div>
            )}
        </div>
    );
};

const SuggestItem = ({
    title,
    date,
    checked,
    onToggle,
    score
}: {
    title: string,
    date?: Date,
    checked: boolean,
    onToggle: () => void,
    score?: number
}) => (
    <div
        onClick={onToggle}
        className={`
            group p-3 rounded-xl border shadow-sm transition-all cursor-pointer relative
            ${checked ? 'bg-green-50 border-primary ring-1 ring-primary' : 'bg-white border-gray-100 hover:shadow-md'}
        `}
    >
        <div className="flex items-start gap-3">
            <div className={`
                mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors
                ${checked ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'}
             `}>
                {checked && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>

            <div className="flex-1">
                <h4 className={`text-sm font-medium line-clamp-2 ${checked ? 'text-primary' : 'text-gray-700'}`}>
                    {title}
                </h4>
                {date && (
                    <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Calendar size={10} />
                            {date.toLocaleDateString()}
                        </div>
                        {/*@ts-ignore*/}
                        {score !== undefined && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full">
                                {Math.round(score * 100)}% Match
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
);
