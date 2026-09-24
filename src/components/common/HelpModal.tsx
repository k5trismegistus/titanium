import React, { useState } from 'react';
import { X, Globe } from 'lucide-react';
import noteEditImg from '../../assets/readme/note_edit.png';
import mixSelectImg from '../../assets/readme/mix_1_select.png';
import mixResultImg from '../../assets/readme/mix_3_result.png';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [lang, setLang] = useState<'en' | 'jp'>('en');
    const isJP = lang === 'jp';

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        {isJP ? 'ヘルプ & ガイド' : 'Help & Guide'}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLang((l) => (l === 'jp' ? 'en' : 'jp'))}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                            <Globe size={14} />
                            {isJP ? 'English' : 'Japanese'}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[70dvh] space-y-8">
                    {/* Section 1: Philosophy */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {isJP ? '🧭 Titaniumの思想' : '🧭 Titanium Philosophy'}
                        </h3>
                        <div className="text-gray-600 leading-relaxed space-y-3">
                            {isJP ? (
                                <>
                                    <p>
                                        Titaniumは「考える流れを止めない」ためのノートです。素早く書けて、あとから自然につながる。
                                        思考の熱量を保ったまま、<b>書く → 見つかる → 混ざる</b>
                                        を回せるように設計されています。
                                    </p>
                                    <p>
                                        AIは答えを置き換えるものではなく、連想の触媒。あなたが主役で、AIは「もうひとつの視点」を
                                        出すための相棒です。
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        Titanium is built to keep your thinking in motion: write
                                        fast, rediscover naturally. It’s designed to support a flow
                                        of <b>write → connect → synthesize</b> without breaking your
                                        momentum.
                                    </p>
                                    <p>
                                        AI doesn’t replace your answers. It acts as a catalyst for
                                        association, offering another angle while you stay in the
                                        driver’s seat.
                                    </p>
                                </>
                            )}
                        </div>
                    </section>

                    {/* Section 2: Basic Writing Flow */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {isJP ? '✍️ 基本の使い方' : '✍️ Core Workflow'}
                        </h3>
                        <div className="text-gray-600 leading-relaxed space-y-3">
                            {isJP ? (
                                <>
                                    <p>
                                        新規ノートを作成して、そのまま書き始めます。入力は数秒で自動保存され、
                                        右上のステータスで保存状態を確認できます。
                                    </p>
                                    <p>
                                        書式はエディタ内に直接表示されます。見出しやリストは上部のツールバーから設定できます。
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        Create a new note and start writing. Your input is
                                        auto-saved after a few seconds, and the status indicator
                                        shows whether it’s saved.
                                    </p>
                                    <p>
                                        Formatting appears directly in the editor. Use the toolbar
                                        for headings and lists.
                                    </p>
                                </>
                            )}
                        </div>
                        <figure className="mt-4 space-y-2">
                            <img
                                src={noteEditImg}
                                alt={isJP ? 'ノート編集画面の例' : 'Example of the note editor'}
                                className="w-full rounded-lg border border-gray-100 shadow-sm"
                                loading="lazy"
                            />
                            <figcaption className="text-xs text-gray-400">
                                {isJP
                                    ? '書く → 書式を整える → 自動保存の流れ'
                                    : 'Write → Format → Auto-save flow'}
                            </figcaption>
                        </figure>
                    </section>

                    {/* Section 3: Suggestions */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {isJP
                                ? '💡 関連ノートの提案 (Suggestions)'
                                : '💡 Related Note Suggestions'}
                        </h3>
                        <div className="text-gray-600 leading-relaxed space-y-3">
                            {isJP ? (
                                <>
                                    <p>
                                        デスクトップでは右側の「Related
                                        Thoughts」に、今書いているセクションに近いノートが表示されます。
                                        単なるキーワード一致ではなく、文脈と意味の近さで探しているため、直感的に関連する発想が見つかります。
                                    </p>
                                    <p>
                                        気になるノートをクリックすると選択状態になり、Mixの材料として使えます。
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        On desktop, the “Related Thoughts” rail surfaces notes close
                                        to the section you’re currently writing. It matches by
                                        context and meaning, not just keywords, so related ideas
                                        appear naturally.
                                    </p>
                                    <p>Click a note to select it as an ingredient for Mix.</p>
                                </>
                            )}
                        </div>
                        <figure className="mt-4 space-y-2">
                            <img
                                src={mixSelectImg}
                                alt={isJP ? '関連ノートを選択する例' : 'Selecting related notes'}
                                className="w-full rounded-lg border border-gray-100 shadow-sm"
                                loading="lazy"
                            />
                            <figcaption className="text-xs text-gray-400">
                                {isJP
                                    ? '関連ノートを選んでMixに渡す'
                                    : 'Pick related notes and send them to Mix'}
                            </figcaption>
                        </figure>
                    </section>

                    {/* Section 4: Quick Word */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {isJP ? '⚡ Quick Word' : '⚡ Quick Word'}
                        </h3>
                        <div className="text-gray-600 leading-relaxed space-y-3">
                            {isJP ? (
                                <>
                                    <p>
                                        ヘッダーのQuick
                                        Wordに単語を入れて保存すると、その単語の解説ノートが自動生成されます。
                                    </p>
                                    <p>
                                        あらかじめ登録しておくと、関連サジェストやMixの素材として活用できます。
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        Drop a term into Quick Word in the header to auto-generate a
                                        short explainer note.
                                    </p>
                                    <p>
                                        Stockpiled terms will later surface in suggestions and Mix.
                                    </p>
                                </>
                            )}
                        </div>
                    </section>

                    {/* Section 5: Mix */}
                    <section>
                        <h3 className="text-lg font-bold text-primary mb-3">
                            {isJP ? '✨ Mix (AI合成)' : '✨ Mix (AI Synthesis)'}
                        </h3>
                        <div className="text-gray-600 leading-relaxed space-y-3 mb-4">
                            {isJP ? (
                                <>
                                    <p>
                                        複数のノートやアイデアを組み合わせて、<b>新しい洞察</b>
                                        を生み出す機能です。 右側のRelated
                                        Thoughtsパネル下部のMixボタンから実行し、選択したノートと現在開いているノートを材料にして合成します。
                                    </p>
                                    <p>もし選択がない場合でも、現在のノートだけでMixできます。</p>
                                    <p>
                                        Mixカテゴリはサイドパネル下部で指定できます。
                                        ドロップダウン最下部の「+Add」から新しいカテゴリを追加できます。
                                        Mix結果はそのまま新規ノートとして保存できます。
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p>
                                        Mix combines multiple notes or ideas to create{' '}
                                        <b>new insights</b>. Run it from the Mix button at the
                                        bottom of the Related Thoughts panel to synthesize selected
                                        notes plus the one you’re currently editing.
                                    </p>
                                    <p>If nothing is selected, Mix uses the current note alone.</p>
                                    <p>
                                        Mix category sets the output tone. Use +Add at the bottom of
                                        the dropdown to create a new category. You can save the Mix
                                        result as a new note.
                                    </p>
                                </>
                            )}
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-500">
                            {isJP ? (
                                <>
                                    * Mixの出力は、元のノートの言語に合わせて生成されます。
                                    <br />* 内容の書き換えではなく、<b>「化学反応」</b>
                                    を起こすことを目的としています。
                                </>
                            ) : (
                                <>
                                    * The output is generated in the same language as the primary
                                    note.
                                    <br />* The goal is not just rewriting, but creating a{' '}
                                    <b>"Chemical Reaction"</b> between ideas.
                                </>
                            )}
                        </div>
                        <figure className="mt-4 space-y-2">
                            <img
                                src={mixResultImg}
                                alt={isJP ? 'Mix結果の例' : 'Example of a Mix result'}
                                className="w-full rounded-lg border border-gray-100 shadow-sm"
                                loading="lazy"
                            />
                            <figcaption className="text-xs text-gray-400">
                                {isJP
                                    ? 'Mixの出力を確認して新規ノートとして保存'
                                    : 'Review the Mix output and save as a new note'}
                            </figcaption>
                        </figure>
                    </section>
                </div>
            </div>
        </div>
    );
};
