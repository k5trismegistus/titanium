import React, { useState } from 'react';
import { HelpCircle, Plus } from 'lucide-react';
import { useAuth } from '../../lib/firebase/auth';
import { HelpModal } from './HelpModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useUserCategories } from '../../hooks/useUserCategories';

export const Header: React.FC = () => {
    const { user } = useAuth();
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const isDemoRoute = location.pathname === "/demo";
    const { categories } = useUserCategories();
    const defaultCategory = categories[0] || "Memo";

    const handleCreateNote = async () => {
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, "notes"), {
                userId: user.uid,
                markdown: "",
                category: defaultCategory,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
            navigate(`/note/${docRef.id}`);
        } catch (e) {
            console.error("Failed to create note:", e);
            alert("Failed to create note.");
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
