import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import { useAuth } from '../lib/firebase/auth';

const DEFAULT_CATEGORIES = ['Memo', 'Blog', 'Qiita', 'Twitter'];

const normalizeCategory = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim();
};

const dedupeCategories = (values: string[]) => {
    const seen = new Set<string>();
    return values.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const coerceCategories = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    const trimmed = value.map(normalizeCategory).filter((item) => item.length > 0);
    return dedupeCategories(trimmed);
};

export const useUserCategories = () => {
    const { user } = useAuth();
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isActive = true;
        const loadCategories = async () => {
            if (!user) {
                if (isActive) {
                    setCategories(DEFAULT_CATEGORIES);
                    setIsLoading(false);
                }
                return;
            }

            const userRef = doc(db, 'users', user.uid);

            try {
                const snapshot = await getDoc(userRef);
                if (!isActive) return;

                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const loaded = coerceCategories(data.categories);

                    if (loaded.length > 0) {
                        setCategories(loaded);
                    } else {
                        setCategories(DEFAULT_CATEGORIES);
                        await setDoc(
                            userRef,
                            {
                                categories: DEFAULT_CATEGORIES,
                                updatedAt: serverTimestamp(),
                            },
                            { merge: true },
                        );
                    }
                } else {
                    setCategories(DEFAULT_CATEGORIES);
                    await setDoc(userRef, {
                        categories: DEFAULT_CATEGORIES,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                }
            } catch (error) {
                console.error('Failed to load user categories:', error);
                if (isActive) {
                    setCategories(DEFAULT_CATEGORIES);
                }
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        loadCategories();

        return () => {
            isActive = false;
        };
    }, [user]);

    const addCategory = async (rawCategory: string) => {
        if (!user) return null;
        const trimmed = normalizeCategory(rawCategory);
        if (!trimmed) return null;

        const existing = categories.find((item) => item.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;

        const nextCategories = [...categories, trimmed];
        setCategories(nextCategories);

        try {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(
                userRef,
                {
                    categories: nextCategories,
                    updatedAt: serverTimestamp(),
                },
                { merge: true },
            );
        } catch (error) {
            console.error('Failed to add category:', error);
        }

        return trimmed;
    };

    return { categories, addCategory, isLoading };
};
