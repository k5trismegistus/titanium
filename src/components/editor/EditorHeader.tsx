import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { CategorySelect } from '../common/CategorySelect';

export type SaveStatus = "dirty" | "saving" | "saved";

type EditorHeaderProps = {
    saveStatus: SaveStatus;
    characterCount: number;
    category: string;
    setCategory: (next: string) => void;
    categories: string[];
    onAddCategory: (next: string) => void;
    onDeleteNote?: () => void;
    isDeletingNote?: boolean;
};

export const EditorHeader: React.FC<EditorHeaderProps> = ({
    saveStatus,
    characterCount,
    category,
    setCategory,
    categories,
    onAddCategory,
    onDeleteNote,
    isDeletingNote = false
}) => {
    return (
        <div className="flex h-12 items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Category</label>
                <CategorySelect
                    value={category}
                    options={categories}
                    onChange={setCategory}
                    onAdd={onAddCategory}
                />
            </div>
            <div className="flex items-center gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {characterCount.toLocaleString()} chars
                </div>
                {onDeleteNote && (
                    <button
                        type="button"
                        onClick={onDeleteNote}
                        disabled={isDeletingNote}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Delete note"
                    >
                        {isDeletingNote ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        <span>Delete</span>
                    </button>
                )}
                <SaveIndicator status={saveStatus} />
            </div>
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
