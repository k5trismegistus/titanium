import React from 'react';
import { Sparkles } from 'lucide-react';

interface MixButtonProps {
    onClick?: () => void;
    disabled?: boolean;
}

export const MixButton: React.FC<MixButtonProps> = ({ onClick, disabled }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
        bg-primary text-white px-4 py-1.5 rounded-full text-sm font-medium 
        hover:opacity-90 transition-all flex items-center gap-1
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
        >
            <Sparkles size={14} />
            <span>Mix</span>
        </button>
    );
};
