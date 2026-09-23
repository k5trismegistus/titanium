import React, { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, Trash2 } from 'lucide-react';
import { CategorySelect } from '../common/CategorySelect';

export type SaveStatus = 'dirty' | 'saving' | 'saved';

type EditorHeaderProps = {
    saveStatus: SaveStatus;
    category: string;
    setCategory: (next: string) => void;
    categories: string[];
    onAddCategory: (next: string) => void;
    onCopyNote?: () => Promise<void> | void;
    onDeleteNote?: () => void;
    isDeletingNote?: boolean;
};

export const EditorHeader: React.FC<EditorHeaderProps> = ({
    saveStatus,
    category,
    setCategory,
    categories,
    onAddCategory,
    onCopyNote,
    onDeleteNote,
    isDeletingNote = false,
}) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = async () => {
        if (!onCopyNote) return;
        await onCopyNote();
        setIsCopied(true);
        window.setTimeout(() => setIsCopied(false), 1200);
    };

    return (
        <div className="flex h-12 min-w-0 items-center justify-between gap-2 px-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <label className="hidden text-xs text-gray-400 sm:inline">Category</label>
                <CategorySelect
                    value={category}
                    options={categories}
                    onChange={setCategory}
                    onAdd={onAddCategory}
                    className="min-w-0 flex-1"
                    selectClassName="w-full max-w-[11rem] sm:max-w-[14rem]"
                    inputClassName="w-full max-w-[11rem] sm:max-w-[14rem]"
                />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {onCopyNote && (
                    <button
                        type="button"
                        onClick={() => {
                            void handleCopy();
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        aria-label={isCopied ? 'Copied' : 'Copy note'}
                        title={isCopied ? 'Copied' : 'Copy note'}
                    >
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                )}
                {onDeleteNote && (
                    <button
                        type="button"
                        onClick={onDeleteNote}
                        disabled={isDeletingNote}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Delete note"
                        title="Delete note"
                    >
                        {isDeletingNote ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Trash2 size={12} />
                        )}
                    </button>
                )}
                <SaveIndicator status={saveStatus} />
            </div>
        </div>
    );
};

const SaveIndicator = ({ status }: { status: SaveStatus }) => {
    const label = status === 'saving' ? 'Saving...' : status === 'dirty' ? 'Unsaved' : 'Saved';
    const baseClass = 'flex h-8 w-8 items-center justify-center rounded-lg border';
    const toneClass =
        status === 'dirty'
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : status === 'saving'
              ? 'text-blue-700 bg-blue-50 border-blue-200'
              : 'text-green-700 bg-green-50 border-green-200';

    return (
        <div className={`${baseClass} ${toneClass}`} title={label} aria-label={label} role="status">
            {status === 'saving' ? (
                <Loader2 className="animate-spin" size={14} />
            ) : status === 'dirty' ? (
                <AlertCircle size={14} />
            ) : (
                <CheckCircle2 size={14} />
            )}
        </div>
    );
};
