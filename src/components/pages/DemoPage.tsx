import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MainLayout } from '../layout/MainLayout';
import { MainEditor } from '../editor/MainEditor';
import { EditorHeader, SaveStatus } from '../editor/EditorHeader';
import { useEditorContext } from '../../context/EditorContext';
import type { DemoSuggestionMap, MixSelectableNote } from '../suggestions/SuggestRail';

type Category = string;

type DemoSectionState = {
    heading: string;
    text: string;
};

const DEMO_CONTENT = `# デモの見どころ
この画面は読み取り専用。WYSIWYGの見た目と関連ノート体験だけ確認できます。

- 右上のトグルで WYSIWYG / Markdown を切り替え
- WYSIWYGでも見出しの # が残る
- Markdownモードでは下にPreviewが出る

# 問いの核
AIは「正解を出す」よりも「思考の流れを止めない」ほうが価値が高い。
ノートは記録ではなく探索。書きながら問いを磨く場所にしたい。
そのために、関連ノートの接続とMixによる発展を自然に起こす。

# 観察されたサイン
作業中に過去メモを探しに行くと、集中が切れてしまう。
関連アイデアは「今の文脈」で引き出されると再利用しやすい。
複数のメモを同時に読み直すのは心理的コストが高い。

# 仕組みのスケッチ
執筆中のセクションを解析し、意味的に近いノートを提案する。
選択したノートと現在のノートをMixし、新しい視点を生成する。
生成結果は別ノートとして保存し、再利用可能にする。

# 次の一手
セクション移動時に関連ノートが変わる体験を強調する。
Mix結果の保存後に、生成ノートが増える導線を見せる。
書く -> つながる -> 混ざるがひとつの画面で完結することを示す。
`;

const DEMO_SUGGESTIONS: DemoSuggestionMap = {
    'デモの見どころ': [
        {
            id: 'demo-ui-1',
            markdown: 'WYSIWYGとMarkdownを両立させる編集設計',
            updatedAt: new Date('2024-02-15'),
            score: 0.9
        },
        {
            id: 'demo-ui-2',
            markdown: '見出し記号を残して文脈を保つUI',
            updatedAt: new Date('2024-02-09'),
            score: 0.86
        },
        {
            id: 'demo-ui-3',
            markdown: 'デモで理解させる最小の説明量',
            updatedAt: new Date('2024-01-27'),
            score: 0.82
        }
    ],
    '問いの核': [
        {
            id: 'demo-focus-1',
            markdown: '思考の熱量を落とさないUIの作り方',
            updatedAt: new Date('2024-02-08'),
            score: 0.92
        },
        {
            id: 'demo-focus-2',
            markdown: '文脈ベースの連想で発想を拡張する',
            updatedAt: new Date('2024-01-29'),
            score: 0.88
        },
        {
            id: 'demo-focus-3',
            markdown: 'メモ探索の摩擦をどう減らすか',
            updatedAt: new Date('2023-12-18'),
            score: 0.83
        }
    ],
    '観察されたサイン': [
        {
            id: 'demo-signal-1',
            markdown: '集中が切れるタイミングの分析メモ',
            updatedAt: new Date('2024-02-01'),
            score: 0.9
        },
        {
            id: 'demo-signal-2',
            markdown: '関連アイデアの再利用を促す仕掛け',
            updatedAt: new Date('2024-01-20'),
            score: 0.86
        },
        {
            id: 'demo-signal-3',
            markdown: '複数ノート比較の負担が大きい理由',
            updatedAt: new Date('2023-11-12'),
            score: 0.81
        }
    ],
    '仕組みのスケッチ': [
        {
            id: 'demo-mech-1',
            markdown: 'セクション単位での関連ノート抽出案',
            updatedAt: new Date('2024-02-14'),
            score: 0.93
        },
        {
            id: 'demo-mech-2',
            markdown: 'Mixは化学反応を起こすための装置',
            updatedAt: new Date('2024-01-25'),
            score: 0.89
        },
        {
            id: 'demo-mech-3',
            markdown: '生成結果を資産化する運用のメモ',
            updatedAt: new Date('2023-12-03'),
            score: 0.84
        }
    ],
    '次の一手': [
        {
            id: 'demo-next-1',
            markdown: '体験のループを可視化する構成案',
            updatedAt: new Date('2024-02-10'),
            score: 0.91
        },
        {
            id: 'demo-next-2',
            markdown: 'Mix直後に見せるフィードバック設計',
            updatedAt: new Date('2024-01-09'),
            score: 0.85
        },
        {
            id: 'demo-next-3',
            markdown: 'デモ体験で価値を掴ませる導線',
            updatedAt: new Date('2023-10-30'),
            score: 0.8
        }
    ],
    Introduction: [
        {
            id: 'demo-intro-1',
            markdown: '思考を止めないノートの設計メモ',
            updatedAt: new Date('2024-02-05'),
            score: 0.82
        }
    ],
    default: [
        {
            id: 'demo-default-1',
            markdown: 'ノート同士の化学反応を起こす仕掛け',
            updatedAt: new Date('2024-02-03'),
            score: 0.79
        }
    ]
};

const DEFAULT_CATEGORIES = ["Memo", "Blog", "Qiita", "Twitter"];

export const DemoPage: React.FC = () => {
    const [content, setContent] = useState(DEMO_CONTENT);
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
    const [category, setCategory] = useState<Category>(DEFAULT_CATEGORIES[0]);
    const [mixCategory, setMixCategory] = useState<Category>(DEFAULT_CATEGORIES[0]);
    const [mixCategoryTouched, setMixCategoryTouched] = useState(false);
    const [selectedNotes, setSelectedNotes] = useState<MixSelectableNote[]>([]);
    const [isMixing, setIsMixing] = useState(false);
    const [mixResult, setMixResult] = useState('');
    const [isMixModalOpen, setIsMixModalOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<DemoSectionState>({ heading: '', text: '' });

    const handleToggleNote = (note: MixSelectableNote) => {
        setSelectedNotes(prev => (
            prev.some((item) => item.id === note.id)
                ? prev.filter(item => item.id !== note.id)
                : [...prev, note]
        ));
    };

    const handleSectionChange = useCallback((next: DemoSectionState) => {
        setActiveSection(next);
    }, []);

    const handleMix = () => {
        setIsMixing(true);
        const nextMarkdown = buildDemoMixMarkdown(activeSection, selectedNotes, mixCategory);
        setTimeout(() => {
            setMixResult(nextMarkdown);
            setIsMixModalOpen(true);
            setIsMixing(false);
        }, 500);
    };

    const handleSaveMix = () => {
        if (!mixResult) return;
        setContent(mixResult);
        setSelectedNotes([]);
        setIsMixModalOpen(false);
        setMixResult('');
    };

    const handleAddCategory = (next: string) => {
        const trimmed = next.trim();
        if (!trimmed) return;
        setCategories((prev) => {
            if (prev.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                return prev;
            }
            return [...prev, trimmed];
        });
    };

    useEffect(() => {
        if (!mixCategoryTouched) {
            setMixCategory(category);
        }
    }, [category, mixCategoryTouched]);

    const saveStatus: SaveStatus = 'saved';

    return (
        <>
            <MainLayout
                editorHeader={
                <EditorHeader
                    saveStatus={saveStatus}
                    category={category}
                    setCategory={setCategory}
                    categories={categories}
                    onAddCategory={handleAddCategory}
                />
                }
                selectedNotes={selectedNotes}
                onToggleNote={handleToggleNote}
                demoSuggestions={DEMO_SUGGESTIONS}
                mixCategory={mixCategory}
                onChangeMixCategory={(next) => {
                    setMixCategoryTouched(true);
                    setMixCategory(next as Category);
                }}
                categories={categories}
                onAddCategory={(next) => {
                    handleAddCategory(next);
                }}
                onMix={handleMix}
                isMixing={isMixing}
                isMixAllowed={true}
            >
                <DemoEditor content={content} setContent={setContent} onSectionChange={handleSectionChange} />
            </MainLayout>

            {isMixModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-muted px-5 py-3">
                            <div className="text-sm font-semibold text-gray-800">Mix Result</div>
                            <button
                                onClick={() => setIsMixModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                aria-label="Close"
                                type="button"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-[60dvh] overflow-y-auto px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap">
                            {mixResult}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-muted px-5 py-3">
                            <button
                                onClick={() => setIsMixModalOpen(false)}
                                className="text-sm text-gray-500 hover:text-gray-700"
                                type="button"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSaveMix}
                                className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-60"
                                disabled={!mixResult}
                                type="button"
                            >
                                Save as new note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const DemoEditor = ({
    content,
    setContent,
    onSectionChange
}: {
    content: string;
    setContent: (next: string) => void;
    onSectionChange: (next: DemoSectionState) => void;
}) => {
    const { activeSectionHeading, activeSectionText } = useEditorContext();

    useEffect(() => {
        onSectionChange({ heading: activeSectionHeading, text: activeSectionText });
    }, [activeSectionHeading, activeSectionText, onSectionChange]);

    return <MainEditor content={content} setContent={setContent} readOnly />;
};

const buildDemoMixMarkdown = (
    section: DemoSectionState,
    notes: MixSelectableNote[],
    category: Category
) => {
    const normalizedCategory = category.trim().toLowerCase();
    const heading = section.heading || 'Introduction';
    const text = section.text.split('\n').slice(1).join(' ').trim();
    const snippet = text ? text.slice(0, 160) : '今書いているセクションの要点を整理する。';
    const sources = notes.length
        ? notes.map(note => `- ${note.markdown.slice(0, 56)}`).join('\n')
        : '- （選択なし）';

    if (normalizedCategory === 'twitter') {
        return [
            `1/ ${heading}を起点に、思考の流れを止めないノート体験を設計する。`,
            `2/ ${snippet}`,
            `3/ 関連ノート: ${notes.map(note => note.markdown.slice(0, 24)).join(' / ') || '今のノートだけで十分'}.`
        ].join('\n');
    }

    if (normalizedCategory === 'qiita') {
        return `# ${heading}を起点にしたMixのまとめ\n\n` +
            `## 課題\n${snippet}\n\n` +
            `## アプローチ\n文脈で関連ノートを引き寄せ、Mixで新しい視点を生成する。\n\n` +
            `## 参考にしたノート\n${sources}`;
    }

    if (normalizedCategory === 'blog') {
        return `# ${heading}から広げるアイデア\n\n` +
            `${snippet}\n\n` +
            `## なぜ今これか\n今の文脈で関連ノートを呼び出すことで、思考の分断を防げる。\n\n` +
            `## Mixの価値\n複数の視点を統合して、新しい問いを生み出す。\n\n` +
            `## 参照\n${sources}`;
    }

    return `# Mix: ${heading}\n\n` +
        `## 要約\n` +
        `- 現在のセクションを軸に、新しい視点を組み立てる。\n` +
        `- ${notes.length ? `関連ノート: ${notes.map(note => note.markdown.slice(0, 24)).join(' / ')}` : '関連ノート: 選択なし'}\n` +
        `- 次の行動を小さく切り出す。\n\n` +
        `## メモ\n${snippet}\n\n` +
        `## 参照\n${sources}`;
};
