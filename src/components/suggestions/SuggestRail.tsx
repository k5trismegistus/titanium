import React, { useState, useEffect, useMemo } from 'react';
import { Lightbulb, ChevronRight, ChevronLeft, Calendar, ArrowUpRight } from 'lucide-react';
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
    isMixAllowed = false
}) => {
    const { user } = useAuth();
    const { noteId: currentId } = useParams<{ noteId: string }>();
    const navigate = useNavigate();
    const { activeSectionText, activeSectionHeading } = useEditorContext();
    const [isOpen, setIsOpen] = useState(() => {
        if (typeof window === "undefined") return true;
        return window.innerWidth >= 1024;
    });
    const [suggestions, setSuggestions] = useState<MixSelectableNote[]>([]);
    const [loading, setLoading] = useState(false);
    const canOpenNotes = !demoSuggestions;
    const selectedIds = new Set(selectedNotes.map((note) => note.id));
    const filteredSuggestions = suggestions.filter((note) => !selectedIds.has(note.id));
    const queryText = useMemo(() => buildDistinctiveQueryText({
        sectionHeading: activeSectionHeading,
        sectionText: activeSectionText,
        noteMarkdown: currentNoteMarkdown
    }), [activeSectionHeading, activeSectionText, currentNoteMarkdown]);
    const railClassName = isOpen
        ? "fixed right-0 bottom-0 top-14 z-30 w-80 bg-gray-50 border-l border-muted transition-all duration-300 ease-in-out lg:sticky lg:top-[calc(var(--global-header-height,3.5rem)+var(--editor-header-height,0px))] lg:h-[calc(100svh-var(--global-header-height,3.5rem)-var(--editor-header-height,0px))] lg:self-start"
        : "fixed right-3 bottom-24 z-30 h-12 w-12 rounded-full bg-gray-50 border border-muted shadow-md transition-all duration-300 ease-in-out lg:sticky lg:right-auto lg:bottom-auto lg:top-[calc(var(--global-header-height,3.5rem)+var(--editor-header-height,0px))] lg:h-[calc(100svh-var(--global-header-height,3.5rem)-var(--editor-header-height,0px))] lg:w-12 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none lg:self-start";
    // 開いた状態では、画面外に逃げないようパネル内へ閉じるボタンを置く。
    const toggleButtonClassName = isOpen
        ? "absolute left-3 top-3 z-30 rounded-full border border-muted bg-white p-1.5 text-gray-400 shadow-sm hover:text-primary"
        : "flex h-full w-full items-center justify-center rounded-full text-gray-400 hover:text-primary lg:absolute lg:-left-3 lg:top-4 lg:h-auto lg:w-auto lg:bg-white lg:border lg:border-muted lg:p-1 lg:shadow-sm";

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
        <div className={railClassName}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={toggleButtonClassName}
                aria-label={isOpen ? "Close related thoughts" : "Open related thoughts"}
                aria-expanded={isOpen}
            >
                {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {isOpen ? (
                <div className="flex h-full flex-col">
                    <div className="p-4 pl-12">
                        <div className="flex items-center gap-2 mb-6 text-gray-500 text-sm font-medium">
                            <Lightbulb size={16} />
                            <span>Related Thoughts</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                        {selectedNotes.length > 0 && (
                            <div className="mb-6">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    Selected for Mix
                                </div>
                                <div className="mt-2 space-y-2">
                                    {selectedNotes.map(note => (
                                        <SuggestItem
                                            key={`selected-${note.id}`}
                                            title={note.markdown.slice(0, 50) || "Untitled Note"}
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
                                        title={note.markdown.slice(0, 50) || "Untitled Note"}
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

                    {onMix && onChangeMixCategory && onAddCategory && (
                        <div className="border-t border-muted bg-white/90 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Mix Output
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <CategorySelect
                                    value={mixCategory ?? ""}
                                    options={categories}
                                    onChange={onChangeMixCategory}
                                    onAdd={onAddCategory}
                                    selectClassName="min-w-[140px]"
                                />
                            </div>
                            <div className="mt-3 flex justify-end">
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
            group p-3 rounded-xl border shadow-sm transition-all cursor-pointer relative
            ${checked ? 'bg-green-50 border-primary ring-1 ring-primary' : 'bg-white border-gray-100 hover:shadow-md'}
        `}
    >
        {onOpen && (
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:text-primary hover:border-primary/40 transition-colors"
            >
                Open
                <ArrowUpRight size={12} />
            </button>
        )}
        <div className="flex items-start gap-3">
            <div className={`
                mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors
                ${checked ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'}
             `}>
                {checked && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>

            <div className="flex-1">
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
