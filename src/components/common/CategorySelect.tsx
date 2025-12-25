import React, { useEffect, useState } from 'react';

const ADD_OPTION_VALUE = "__add__";

type CategorySelectProps = {
    value: string;
    options: string[];
    onChange: (next: string) => void;
    onAdd: (next: string) => void;
    className?: string;
    selectClassName?: string;
    inputClassName?: string;
};

export const CategorySelect: React.FC<CategorySelectProps> = ({
    value,
    options,
    onChange,
    onAdd,
    className = "",
    selectClassName = "",
    inputClassName = ""
}) => {
    const [draftCategory, setDraftCategory] = useState("");
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const trimmedValue = value.trim();
    const cleanOptions = options.map((item) => item.trim()).filter((item) => item.length > 0);
    const hasCurrent = trimmedValue.length > 0 &&
        cleanOptions.some((item) => item.toLowerCase() === trimmedValue.toLowerCase());
    const resolvedOptions = hasCurrent || trimmedValue.length === 0
        ? cleanOptions
        : [trimmedValue, ...cleanOptions];

    useEffect(() => {
        if (!isAddingCategory) {
            setDraftCategory("");
        }
    }, [isAddingCategory]);

    useEffect(() => {
        if (!trimmedValue && resolvedOptions.length > 0) {
            onChange(resolvedOptions[0]);
        }
    }, [trimmedValue, resolvedOptions, onChange]);

    const handleSelect = (nextValue: string) => {
        if (nextValue === ADD_OPTION_VALUE) {
            setIsAddingCategory(true);
            return;
        }
        if (nextValue && nextValue !== value) {
            onChange(nextValue);
        }
    };

    const handleAddCategory = () => {
        const nextValue = draftCategory.trim();
        if (!nextValue) return;

        const match = resolvedOptions.find(
            (item) => item.toLowerCase() === nextValue.toLowerCase()
        );
        if (match) {
            onChange(match);
        } else {
            onChange(nextValue);
            onAdd(nextValue);
        }

        setDraftCategory("");
        setIsAddingCategory(false);
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {!isAddingCategory ? (
                <select
                    value={trimmedValue}
                    onChange={(e) => handleSelect(e.target.value)}
                    className={`min-w-[160px] text-base border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none ${selectClassName}`}
                >
                    {resolvedOptions.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                    <option value={ADD_OPTION_VALUE}>+ Add</option>
                </select>
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
                        className={`w-36 text-base border-gray-200 bg-white rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary outline-none ${inputClassName}`}
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
    );
};
