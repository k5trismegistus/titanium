import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, ChevronLeft, Calendar, ArrowUpRight, X } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { searchRelated } from '../../lib/firebase/functions';
import { useAuth } from '../../lib/firebase/auth';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorContext } from '../../context/EditorContext';
import { MixButton } from '../mix/MixButton';
import { CategorySelect } from '../common/CategorySelect';

export type DemoSuggestion = {
    id: string;
    markdown: string;
    updatedAt?: Date;
    score?: number;
};

export type DemoSuggestionMap = Record<string, DemoSuggestion[]>;

export type MixSelectableNote = {
    id: string;
    markdown: string;
    updatedAt?: Date;
};

interface SuggestRailProps {
    selectedNotes: MixSelectableNote[];
    onToggleNote: (note: MixSelectableNote) => void;
    currentNoteMarkdown?: string;
    demoSuggestions?: DemoSuggestionMap;
    mixCategory?: string;
    onChangeMixCategory?: (next: string) => void;
    categories?: string[];
    onAddCategory?: (next: string) => void;
    onMix?: () => void;
    isMixing?: boolean;
    isMixAllowed?: boolean;
    isOpen?: boolean;
    onOpenChange?: (next: boolean) => void;
}

export const SuggestRail: React.FC<SuggestRailProps> = ({
    selectedNotes,
    onToggleNote,
    currentNoteMarkdown,
    demoSuggestions,
    mixCategory,
    onChangeMixCategory,
    categories = [],
    onAddCategory,
    onMix,
    isMixing = false,
    isMixAllowed = false,
    isOpen: controlledIsOpen,
    onOpenChange
}) => {
    const { user } = useAuth();
    const { noteId: currentId } = useParams<{ noteId: string }>();
    const navigate = useNavigate();
    const { activeSectionText, activeSectionHeading } = useEditorContext();
    const [internalIsOpen, setInternalIsOpen] = useState(() => {
        if (typeof window === "undefined") return true;
        return window.innerWidth >= 1024;
    });
    const [suggestions, setSuggestions] = useState<MixSelectableNote[]>([]);
    const [isHintVisible, setIsHintVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const canOpenNotes = !demoSuggestions;
    const selectedIds = new Set(selectedNotes.map((note) => note.id));
    const filteredSuggestions = suggestions.filter((note) => !selectedIds.has(note.id));
    const isOpen = controlledIsOpen ?? internalIsOpen;
    const setIsOpen = onOpenChange ?? setInternalIsOpen;
    const queryText = useMemo(() => buildDistinctiveQueryText({
        sectionHeading: activeSectionHeading,
        sectionText: activeSectionText,
        noteMarkdown: currentNoteMarkdown
    }), [activeSectionHeading, activeSectionText, currentNoteMarkdown]);
    const railClassName = isOpen
        ? "fixed inset-x-0 bottom-0 top-0 z-50 w-full bg-gray-50 transition-all duration-300 ease-in-out lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-[calc(var(--global-header-height,3.5rem)+var(--editor-header-height,0px))] lg:z-30 lg:h-[calc(100svh-var(--global-header-height,3.5rem)-var(--editor-header-height,0px))] lg:w-80 lg:border-l lg:border-muted lg:self-start"
        : "hidden transition-all duration-300 ease-in-out lg:sticky lg:top-[calc(var(--global-header-height,3.5rem)+var(--editor-header-height,0px))] lg:z-30 lg:block lg:h-[calc(100svh-var(--global-header-height,3.5rem)-var(--editor-header-height,0px))] lg:w-12 lg:border-l lg:border-muted lg:bg-gray-50 lg:self-start";
    // スマホでは全画面ドロワーとして開き、閉じるボタンを常に画面内へ置く。
    const toggleButtonClassName = isOpen
        ? "absolute left-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-30 rounded-full border border-muted bg-white p-2 text-gray-400 shadow-sm hover:text-primary lg:-left-3 lg:top-4 lg:p-1"
        : "flex h-full w-full items-center justify-center rounded-full text-gray-400 hover:text-primary lg:absolute lg:-left-3 lg:top-4 lg:h-auto lg:w-auto lg:bg-white lg:border lg:border-muted lg:p-1 lg:shadow-sm";
    const hintSuggestion = filteredSuggestions[0];
    const hintText = hintSuggestion ? extractOpeningFragment(hintSuggestion.markdown) : "";

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!isOpen || window.innerWidth >= 1024) return;

        // ドロワー表示中に背面のエディタがスクロールしないよう固定する。
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        setIsHintVisible(false);
        if (typeof window === "undefined") return;
        if (isOpen || loading || !hintText) return;
        if (window.innerWidth >= 1024) return;

        const timer = window.setTimeout(() => {
            setIsHintVisible(true);
        }, 1800);
        return () => window.clearTimeout(timer);
    }, [queryText, isOpen, loading, hintText]);

    useEffect(() => {
        if (demoSuggestions) {
            const key = activeSectionHeading || "Introduction";
            const nextSuggestions = demoSuggestions[key]
                || demoSuggestions.Introduction
                || demoSuggestions.default
                || [];
            setSuggestions(nextSuggestions);
            setLoading(false);
            return;
        }

        if (!user) return;

        const fetchSuggestions = async () => {
            setLoading(true);
            try {
                if (!currentId) {
                    // 現在ノートがない場合は、最近のノートを提案する。
                    const q = query(
                        collection(db, "notes"),
                        where("userId", "==", user.uid),
                        orderBy("updatedAt", "desc"),
                        limit(10)
                    );
                    const snap = await getDocs(q);
                    const notes = snap.docs.map(d => {
                        const data = d.data() as { markdown?: unknown; updatedAt?: unknown };
                        return {
                            id: d.id,
                            markdown: typeof data.markdown === "string" ? data.markdown : "",
                            updatedAt: toDateSafe(data.updatedAt)
                        };
                    });
                    setSuggestions(notes);
                    return;
                }

                // 文脈クエリでベクトル検索を呼び出す。
                if (import.meta.env.DEV) {
                    const preview = queryText ? queryText.slice(0, 80) : "";
                    console.log(`[suggest] contextual queryText len=${queryText?.length ?? 0} preview="${preview}"`);
                }
                const result = await searchRelated({ noteId: currentId, queryText });
                const relatedNotes = result.data.results.map((r: any) => ({
                    id: r.id,
                    markdown: r.markdown,
                    updatedAt: toDateSafe(r.date)
                }));

                setSuggestions(relatedNotes);
            } catch (e) {
                console.error("Failed to fetch suggestions:", e);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 600);
        return () => clearTimeout(timer);
    }, [user, currentId, queryText, activeSectionHeading, demoSuggestions]);

    return (
        <>
        {!isOpen && isHintVisible && hintSuggestion && hintText && (
            <MobileRelatedHint
                text={hintText}
                onOpen={() => {
                    setIsHintVisible(false);
                    setIsOpen(true);
                }}
            />
        )}
        <div className={railClassName}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={toggleButtonClassName}
                aria-label={isOpen ? "Close related thoughts" : "Open related thoughts"}
                aria-expanded={isOpen}
            >
                {isOpen ? <X size={16} /> : <ChevronLeft size={14} />}
            </button>

            {isOpen ? (
                <div className="flex h-full flex-col">
                    <div className="px-5 pb-4 pl-16 pt-[calc(1rem+env(safe-area-inset-top))] lg:p-4 lg:pl-12">
                        <div className="flex min-h-10 items-center gap-2 text-gray-500 text-sm font-medium">
                            <Lightbulb size={18} />
                            <span>Related Thoughts</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 pb-4 lg:px-4">
                        {selectedNotes.length > 0 && (
                            <div className="mb-6">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    Selected for Mix
                                </div>
                                <div className="mt-2 space-y-2">
                                    {selectedNotes.map(note => (
                                        <SuggestItem
                                            key={`selected-${note.id}`}
                                            title={extractOpeningFragment(note.markdown) || "Untitled Note"}
                                            date={note.updatedAt}
                                            checked
                                            onToggle={() => onToggleNote(note)}
                                            onOpen={canOpenNotes ? () => {
                                                navigate(`/note/${note.id}`);
                                            } : undefined}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-gray-400 text-xs text-center py-4">Finding connections...</div>
                            ) : filteredSuggestions.length === 0 ? (
                                <div className="text-gray-400 text-xs text-center py-4">No other notes found.</div>
                            ) : (
                                filteredSuggestions.map(note => (
                                    <SuggestItem
                                        key={note.id}
                                        title={extractOpeningFragment(note.markdown) || "Untitled Note"}
                                        date={note.updatedAt}
                                        checked={selectedIds.has(note.id)}
                                        onToggle={() => onToggleNote({
                                            id: note.id,
                                            markdown: note.markdown,
                                            updatedAt: note.updatedAt
                                        })}
                                        onOpen={canOpenNotes ? () => {
                                            navigate(`/note/${note.id}`);
                                        } : undefined}
                                    />
                                ))
                        )}
                    </div>
                    </div>

                    {selectedNotes.length > 0 && onMix && onChangeMixCategory && onAddCategory && (
                        <div className="border-t border-muted bg-white/95 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:px-4 lg:pb-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Mix Output
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                                <CategorySelect
                                    value={mixCategory ?? ""}
                                    options={categories}
                                    onChange={onChangeMixCategory}
                                    onAdd={onAddCategory}
                                    className="min-w-0 flex-1"
                                    selectClassName="w-full"
                                    inputClassName="w-full"
                                />
                                <MixButton onClick={onMix} disabled={!isMixAllowed} isLoading={isMixing} />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center pt-6 gap-4">
                    <Lightbulb size={20} className="text-gray-400" />
                </div>
            )}
        </div>
        </>
    );
};

const MobileRelatedHint = ({ text, onOpen }: { text: string; onOpen: () => void }) => {
    if (typeof document === "undefined") return null;

    return createPortal(
        <button
            type="button"
            onClick={onOpen}
            className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-emerald-100 bg-white/95 px-4 py-3 text-left text-sm leading-relaxed text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur transition-all lg:hidden"
        >
            <span className="line-clamp-2">“{text}”</span>
        </button>,
        document.body
    );
};

const SuggestItem = ({
    title,
    date,
    checked,
    onToggle,
    onOpen,
}: {
    title: string,
    date?: Date,
    checked: boolean,
    onToggle: () => void
    onOpen?: () => void
}) => (
    <div
        onClick={onToggle}
        className={`
            group p-3 rounded-xl border shadow-sm transition-all cursor-pointer
            ${checked ? 'bg-green-50 border-primary ring-1 ring-primary' : 'bg-white border-gray-100 hover:shadow-md'}
        `}
    >
        <div className="flex items-start gap-3">
            <div className={`
                mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors
                ${checked ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'}
             `}>
                {checked && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>

            <div className="min-w-0 flex-1">
                <h4 className={`text-sm font-medium line-clamp-2 ${checked ? 'text-primary' : 'text-gray-700'}`}>
                    {title}
                </h4>
                {date && (
                    <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Calendar size={10} />
                            {date.toLocaleDateString()}
                        </div>
                    </div>
                )}
            </div>
            {onOpen && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpen();
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:text-primary hover:border-primary/40 transition-colors"
                >
                    Open
                    <ArrowUpRight size={12} />
                </button>
            )}
        </div>
    </div>
);

const STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "your",
    "する", "いる", "ある", "こと", "ため", "よう", "これ", "それ", "どこ", "および", "また", "です", "ます"
]);

const MAX_QUERY_TEXT_LENGTH = 1000;
const MAX_TOP_TERMS = 8;
const MAX_TOP_SENTENCES = 3;

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const extractOpeningFragment = (markdown: string): string => {
    const lines = markdown
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .split(/\n+/)
        .map((line) => normalizeText(
            line
                .replace(/^#{1,6}\s+/, "")
                .replace(/^[-*+]\s+/, "")
                .replace(/^\d+\.\s+/, "")
                .replace(/^>\s?/, "")
                .replace(/^- \[[ xX]\]\s+/, "")
        ))
        .filter(Boolean);

    const fragment = lines.find((line) => line.length >= 12) || lines[0] || "";
    return fragment.length > 96 ? `${fragment.slice(0, 96).trim()}...` : fragment;
};

const tokenize = (text: string): string[] => {
    const matched = text.toLowerCase().match(/[a-z0-9]{2,}|[ぁ-んァ-ヶー一-龠々]{2,}/g);
    if (!matched) return [];
    return matched.filter((term) => !STOPWORDS.has(term));
};

const buildTermFreq = (tokens: string[]): Map<string, number> => {
    const freq = new Map<string, number>();
    tokens.forEach((token) => {
        freq.set(token, (freq.get(token) ?? 0) + 1);
    });
    return freq;
};

const splitSentences = (text: string): string[] => {
    const lines = text
        .split(/[\n。！？!?]/g)
        .map((line) => normalizeText(line))
        .filter((line) => line.length >= 8);
    return lines;
};

const buildDistinctiveQueryText = ({
    sectionHeading,
    sectionText,
    noteMarkdown
}: {
    sectionHeading?: string;
    sectionText?: string;
    noteMarkdown?: string;
}): string | undefined => {
    const normalizedSectionText = normalizeText(sectionText ?? "");
    if (!normalizedSectionText) return undefined;

    const normalizedNote = normalizeText(noteMarkdown ?? "");
    if (!normalizedNote) {
        return normalizedSectionText.slice(0, MAX_QUERY_TEXT_LENGTH);
    }

    const sectionTokens = tokenize(normalizedSectionText);
    const noteTokens = tokenize(normalizedNote);
    if (sectionTokens.length === 0 || noteTokens.length === 0) {
        return normalizedSectionText.slice(0, MAX_QUERY_TEXT_LENGTH);
    }

    const sectionFreq = buildTermFreq(sectionTokens);
    const noteFreq = buildTermFreq(noteTokens);

    const scoredTerms = Array.from(sectionFreq.entries())
        .map(([term, freq]) => {
            const globalFreq = noteFreq.get(term) ?? 0;
            const specificity = freq / (globalFreq + 1);
            return { term, score: specificity };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_TOP_TERMS);

    const topTermSet = new Set(scoredTerms.map((item) => item.term));
    const topTerms = scoredTerms.map((item) => item.term);

    const scoredSentences = splitSentences(normalizedSectionText)
        .map((sentence) => {
            const sentenceTokens = Array.from(new Set(tokenize(sentence)));
            const score = sentenceTokens.reduce((acc, term) => {
                if (!topTermSet.has(term)) return acc;
                const ranked = scoredTerms.find((item) => item.term === term);
                return acc + (ranked?.score ?? 0);
            }, 0);
            return { sentence, score };
        })
        .sort((a, b) => b.score - a.score || b.sentence.length - a.sentence.length)
        .slice(0, MAX_TOP_SENTENCES)
        .map((item) => item.sentence);

    const headingLine = normalizeText(sectionHeading ?? "");
    const termLine = topTerms.length > 0 ? topTerms.join(" ") : "";
    const sentenceBlock = scoredSentences.join("\n");
    const fallbackBlock = normalizedSectionText.slice(0, 500);

    const query = [headingLine, termLine, sentenceBlock || fallbackBlock]
        .filter(Boolean)
        .join("\n")
        .slice(0, MAX_QUERY_TEXT_LENGTH);

    return query || normalizedSectionText.slice(0, MAX_QUERY_TEXT_LENGTH);
};

const toDateSafe = (value: any): Date | undefined => {
    if (!value) return undefined;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value._seconds === "number") return new Date(value._seconds * 1000);
    return undefined;
};
