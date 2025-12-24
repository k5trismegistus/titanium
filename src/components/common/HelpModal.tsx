import React, { useState } from 'react';
import { X, Globe } from 'lucide-react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [lang, setLang] = useState<'en' | 'jp'>('jp');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        {lang === 'jp' ? 'ヘルプ & ガイド' : 'Help & Guide'}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLang(l => l === 'jp' ? 'en' : 'jp')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                            <Globe size={14} />
                            {lang === 'jp' ? 'English' : '日本語'}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[70vh] space-y-8">

                    {/* Section 1: Suggestions */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {lang === 'jp' ? '💡 関連ノートの提案 (Suggestions)' : '💡 Related Note Suggestions'}
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            {lang === 'jp' ? (
                                <>
                                    Titaniumは、あなたの書いている内容をAIが分析し、過去のノートから<b>意味的に近いもの</b>を自動で提案します。<br />
                                    単なるキーワード一致ではなく、「文脈」や「意味」をベクトル化して比較しているため、直感的に関連するアイデアが見つかります。
                                </>
                            ) : (
                                <>
                                    Titanium uses AI to analyze what you're writing and automatically suggests <b>semantically related notes</b> from your past work.<br />
                                    It goes beyond simple keyword matching by vectorizing the "context" and "meaning," helping you find intuitively relevant ideas.
                                </>
                            )}
                        </p>
                    </section>

                    {/* Section 2: Mix */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {lang === 'jp' ? '✨ Mix (AI合成)' : '✨ Mix (AI Synthesis)'}
                        </h3>
                        <p className="text-gray-600 leading-relaxed mb-4">
                            {lang === 'jp' ? (
                                <>
                                    複数のノートやアイデアを組み合わせて、<b>新しい洞察</b>を生み出す機能です。<br />
                                    選択したノートの内容を <b>Gemini 2.0 Pro</b> (最新の推論モデル) が読み込み、それらを統合・要約・発展させた新しいコンテンツを生成します。
                                </>
                            ) : (
                                <>
                                    A feature to combine multiple notes or ideas to generate <b>new insights</b>.<br />
                                    <b>Gemini 2.0 Pro</b> (the latest reasoning model) reads the selected notes and synthesizes, summarizes, or expands them into new content.
                                </>
                            )}
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-500">
                            {lang === 'jp' ? (
                                <>
                                    * Mixの出力は、元のノートの言語に合わせて生成されます。<br />
                                    * 内容の書き換えではなく、<b>「化学反応」</b>を起こすことを目的としています。
                                </>
                            ) : (
                                <>
                                    * The output is generated in the same language as the source notes.<br />
                                    * The goal is not just rewriting, but creating a <b>"Chemical Reaction"</b> between ideas.
                                </>
                            )}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
};
