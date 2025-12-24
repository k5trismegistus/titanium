import React from 'react';
import { Sparkles } from 'lucide-react';

interface MixButtonProps {
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
}

export const MixButton: React.FC<MixButtonProps> = ({ onClick, disabled, isLoading = false }) => {
    const isDisabled = disabled || isLoading;
    return (
        <button
            onClick={onClick}
            disabled={isDisabled}
            aria-busy={isLoading}
            className={`
        bg-primary text-white px-4 py-1.5 rounded-full text-sm font-medium 
        hover:opacity-90 transition-all flex items-center gap-1
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
        >
            {isLoading ? (
                <>
                    <span className="mix-orbit relative h-4 w-4" aria-hidden="true">
                        <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white" />
                        <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70" />
                    </span>
                    <span>Mixing...</span>
                </>
            ) : (
                <>
                    <Sparkles size={14} />
                    <span>Mix</span>
                </>
            )}
        </button>
    );
};
