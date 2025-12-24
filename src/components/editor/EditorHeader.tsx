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
    const [draftCategory, setDraftCategory] = useState("");
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const trimmedCategory = category.trim();
    const options = categories.filter((item) => item.trim().length > 0);
    const hasCurrent = trimmedCategory.length > 0 &&
        options.some((item) => item.toLowerCase() === trimmedCategory.toLowerCase());
    const resolvedOptions = hasCurrent || trimmedCategory.length === 0
        ? options
        : [trimmedCategory, ...options];

    useEffect(() => {
        if (!isAddingCategory) {
            setDraftCategory("");
        }
    }, [isAddingCategory]);

    useEffect(() => {
        if (!trimmedCategory && resolvedOptions.length > 0) {
            setCategory(resolvedOptions[0]);
        }
    }, [trimmedCategory, resolvedOptions, setCategory]);

    const handleSelectCategory = (value: string) => {
        if (value && value !== category) {
            setCategory(value);
        }
    };

    const handleAddCategory = () => {
        const nextValue = draftCategory.trim();
        if (!nextValue) return;

        const match = resolvedOptions.find(
            (item) => item.toLowerCase() === nextValue.toLowerCase()
        );
        if (match) {
            handleSelectCategory(match);
        } else {
            setCategory(nextValue);
            onAddCategory(nextValue);
        }

        setDraftCategory("");
        setIsAddingCategory(false);
    };

    return (
        <div className="flex h-12 items-center justify-end gap-3 px-4">
            <SaveIndicator status={saveStatus} />
            <label className="text-xs text-gray-400">Category</label>
            <div className="flex items-center gap-2">
                <select
                    value={trimmedCategory}
                    onChange={(e) => handleSelectCategory(e.target.value)}
                    className="min-w-[160px] text-base border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none"
                >
                    {resolvedOptions.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
                {!isAddingCategory ? (
                    <button
                        type="button"
                        onClick={() => setIsAddingCategory(true)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        Add
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <input
                            value={draftCategory}
                            onChange={(e) => setDraftCategory(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleAddCategory();
                                }
                                if (e.key === "Escape") {
                                    setDraftCategory("");
                                    setIsAddingCategory(false);
                                }
                            }}
                            placeholder="New category"
                            className="w-36 text-base border-gray-200 bg-white rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleAddCategory}
                            disabled={!draftCategory.trim()}
                            className="text-xs font-medium text-primary hover:text-green-700 disabled:opacity-50"
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setDraftCategory("");
                                setIsAddingCategory(false);
                            }}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
            <MixButton onClick={onMix} disabled={!isMixAllowed} isLoading={isMixing} />
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
