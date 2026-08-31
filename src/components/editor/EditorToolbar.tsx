export const ModeButton = ({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${isActive ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
    >
        {label}
    </button>
);
