import React from 'react';
import { Loader2 } from 'lucide-react';
import { MixButton } from '../mix/MixButton';

export type SaveStatus = "dirty" | "saving" | "saved";

type EditorHeaderProps = {
    saveStatus: SaveStatus;
    category: string;
    setCategory: (next: string) => void;
    onMix: () => void;
    isMixing: boolean;
    isMixAllowed: boolean;
};

export const EditorHeader: React.FC<EditorHeaderProps> = ({
    saveStatus,
    category,
    setCategory,
    onMix,
    isMixing,
    isMixAllowed
}) => (
    <div className="flex h-12 items-center justify-end gap-3 px-4">
        <SaveIndicator status={saveStatus} />
        <label className="text-xs text-gray-400">Category</label>
        <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none"
        >
            <option value="Memo">Memo</option>
            <option value="Blog">Blog</option>
            <option value="Qiita">Qiita</option>
            <option value="Twitter">Twitter</option>
        </select>
        <MixButton onClick={onMix} disabled={isMixing || !isMixAllowed} />
    </div>
);

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
