import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MixButton } from '../mix/MixButton';

export type SaveStatus = "dirty" | "saving" | "saved";

type EditorHeaderProps = {
    saveStatus: SaveStatus;
    category: string;
    setCategory: (next: string) => void;
    categories: string[];
    onAddCategory: (next: string) => void;
    onMix: () => void;
    isMixing: boolean;
    isMixAllowed: boolean;
};

export const EditorHeader: React.FC<EditorHeaderProps> = ({
    saveStatus,
    category,
    setCategory,
    categories,
    onAddCategory,
    onMix,
    isMixing,
    isMixAllowed
}) => {
    const [draftCategory, setDraftCategory] = useState(category);
    const trimmedCategory = category.trim();
    const options = categories.filter((item) => item.trim().length > 0);
    const hasCurrent = trimmedCategory.length > 0 &&
        options.some((item) => item.toLowerCase() === trimmedCategory.toLowerCase());
    const resolvedOptions = hasCurrent || trimmedCategory.length === 0
        ? options
        : [trimmedCategory, ...options];

    useEffect(() => {
        setDraftCategory(category);
    }, [category]);

    const handleCommit = () => {
        const nextValue = draftCategory.trim();
        if (!nextValue) {
            const fallback = trimmedCategory || resolvedOptions[0] || "";
            if (fallback && fallback !== category) {
                setCategory(fallback);
            }
            setDraftCategory(fallback);
            return;
        }

        const match = resolvedOptions.find(
            (item) => item.toLowerCase() === nextValue.toLowerCase()
        );
        if (match) {
            if (match !== category) {
                setCategory(match);
            }
            setDraftCategory(match);
            return;
        }

        setCategory(nextValue);
        setDraftCategory(nextValue);
        onAddCategory(nextValue);
    };

    return (
        <div className="flex h-12 items-center justify-end gap-3 px-4">
            <SaveIndicator status={saveStatus} />
            <label className="text-xs text-gray-400">Category</label>
            <div className="relative">
                <input
                    list="category-options"
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value)}
                    onBlur={handleCommit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        }
                    }}
                    placeholder="Select or type"
                    className="text-sm border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none"
                />
                <datalist id="category-options">
                    {resolvedOptions.map((item) => (
                        <option key={item} value={item} />
                    ))}
                </datalist>
            </div>
            <MixButton onClick={onMix} disabled={isMixing || !isMixAllowed} />
        </div>
    );
};

const SaveIndicator = ({ status }: { status: SaveStatus }) => {
    const label = status === "saving" ? "Saving..." : status === "dirty" ? "Unsaved" : "Saved";
    const baseClass = "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full";
    const toneClass = status === "dirty"
        ? "text-amber-700 bg-amber-50 border border-amber-200"
        : status === "saving"
            ? "text-blue-700 bg-blue-50 border border-blue-200"
            : "text-green-700 bg-green-50 border border-green-200";

    return (
        <div className={`${baseClass} ${toneClass}`}>
            {status === "saving" ? (
                <Loader2 className="animate-spin" size={12} />
            ) : (
                <span className="w-2 h-2 rounded-full bg-current opacity-80" />
            )}
            <span>{label}</span>
        </div>
    );
};
