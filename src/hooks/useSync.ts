import { useEffect, useState, useRef } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../lib/firebase/auth";

// MVP Strategy: Single persistent note for the user (Scratchpad)
// In a full app, this would take a noteId argument.
export const useSync = (noteId: string, initialContent: string) => {
    const { user } = useAuth();
    const [content, setContent] = useState(initialContent);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedContent, setLastSavedContent] = useState(initialContent);
    const isFirstLoad = useRef(true);

    // Load initial content
    useEffect(() => {
        if (!user || !noteId) return;

        const loadNote = async () => {
            try {
                // noteId should be passed directly if it's not scratchpad logic
                // if noteId is "scratchpad", we use `scratchpad-${uid}`. 
                // But since we are moving to proper routing, we assume noteId is the docId.
                // However, for backward compat with "scratchpad", handle it.

                const docId = noteId === 'scratchpad' ? `scratchpad-${user.uid}` : noteId;
                const noteRef = doc(db, "notes", docId);

                const noteDoc = await getDoc(noteRef);
                if (noteDoc.exists()) {
                    const data = noteDoc.data();
                    setContent(data.markdown || "");
                    setLastSavedContent(data.markdown || "");
                }
            } catch (e) {
                console.error("Failed to load note:", e);
            } finally {
                isFirstLoad.current = false;
            }
        };

        loadNote();
    }, [user, noteId]);

    // Auto-save logic
    useEffect(() => {
        if (!user || isFirstLoad.current || !noteId) return;
        if (content === lastSavedContent) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                const docId = noteId === 'scratchpad' ? `scratchpad-${user.uid}` : noteId;
                const noteRef = doc(db, "notes", docId);
                await setDoc(noteRef, {
                    markdown: content,
                    userId: user.uid,
                    updatedAt: serverTimestamp(),
                }, { merge: true });

                setLastSavedContent(content);
                console.log("Saved to Firestore.");
            } catch (e) {
                console.error("Failed to save note:", e);
            } finally {
                setIsSaving(false);
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [content, user, lastSavedContent, noteId]);

    return { content, setContent, isSaving };
};
