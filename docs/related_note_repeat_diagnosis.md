# related note が「いつも同じノート」になりやすい件の調査メモ

## 0. 調査範囲
- 静的コード調査のみ（本番データ分布や実ログは未確認）。
- 対象:
  - `src/components/suggestions/SuggestRail.tsx`
  - `src/components/editor/MainEditor.tsx`
  - `functions/src/search.ts`
  - `functions/src/triggers.ts`
  - `src/components/pages/NoteEditorPage.tsx`

## 1. 現行ロジック要約（詳細）
### 1-1. 入力
1. フロントは `activeSectionText`（見出し+そのセクション本文）を `queryText` として `searchRelated` に送る。  
   参照: `src/components/editor/MainEditor.tsx:443`, `src/components/suggestions/SuggestRail.tsx:105`, `src/components/suggestions/SuggestRail.tsx:111`

### 1-2. 検索（`queryText` がある通常パス）
2. `queryText` を1本だけ埋め込みに変換する。  
   参照: `functions/src/search.ts:284`, `functions/src/search.ts:295`
3. その1本で `collectionGroup("salientItems")` に対して近傍検索を1回実行する。  
   参照: `functions/src/search.ts:149`

ここで重要なのは、比較単位が「ノート」ではなく「salient item（ノート内の特徴項目）」であること。  
つまり内部的には `queryEmbedding vs 全 salient item` の比較で、上位 `fetchLimit` 件（最大60）を取得している。  
参照: `functions/src/search.ts:145`, `functions/src/search.ts:152`

### 1-3. ノート単位への集約
4. 取得したヒットを `noteId` ごとにまとめる。
5. 同一ノート内では最も強い hit だけを採用する。
   - `hitScore = max(fetchLimit - rank, 1)`
   - 既存より強い hit の場合だけ `score` と `bestRank` を更新する
   - 同点の場合は `bestRank` が小さい方を残す  
   参照: `functions/src/search.ts`
6. 最終並び順は `score desc -> bestRank asc`。  
   参照: `functions/src/search.ts`

### 1-4. 返却
7. 上位 `limit`（通常5）件の `noteId` を `notes` から読み直して返す。  
   参照: `functions/src/search.ts:220`, `functions/src/search.ts:223`
8. salient検索で1件でも返れば、そこで終了（note-level embedding 検索は使わない）。  
   参照: `functions/src/search.ts:320`

### 1-5. 「セクション-ノート間の比較は1回では？」への回答
- 「queryEmbeddingを作る処理」は1回。
- ただし「類似度比較」は1回ではなく、検索対象の全 `salientItems` に対して行われる（Firestoreの近傍検索内部処理）。
- さらに、返ってきた上位ヒットの中で同じ `noteId` が複数回出ても、ノート単位では最も強い hit だけが残る。

簡単な例:
- `fetchLimit = 20`
- Note A の salient item が rank 2 と rank 5 に入る
- Note B の salient item が rank 3 に1件だけ入る

このとき
- Note A: `20-2 = 18点`, `bestRank=2`
- Note B: `20-3 = 17点`, `bestRank=3`

となり、Note A は上位になるが、複数 item hit による累積加点は発生しない。

## 2. 原因候補（確度順）

### A. 候補集合が偏っている（salient 未整備ノートが検索対象外）
- 症状: 一部ノートだけが毎回出やすい。
- 根拠:
  - 検索対象は `salientItems` コレクショングループ。
  - salient が未生成のノートは最初から母集団に入らない。
  - salient検索でヒットした時点で return するため、note-level 側で補完されない。  
    参照: `functions/src/search.ts:149`, `functions/src/search.ts:320`
- 対処:
  - `backfill:salient` を全ノートに実施（必要なら `--force`）。
  - 運用で「salient未生成率」を監視（`salientUpdatedAt` 有無）。

### B. スコア集約は改善済みだが、代表 hit 依存は残る
- 症状: 似た query で同じノートが上位固定。
- 根拠:
  - 現在は同一ノートの複数 hit を累積しないため、多 hit だけで過剰に有利にはならない。
  - ただし、ユーザー内で汎用的に近い salient item を持つノートは、代表 hit が強くなりやすい。
- 対処:
  - 返却前に MMR（多様化）をかける。
  - 直近表示ノートに短期ペナルティをかける。

### C. query が1本で、しかもセクション全文ベース
- 症状: テーマが似るだけで同じ“代表ノート”に吸着。
- 根拠:
  - `queryText` は見出し + セクション本文をそのまま埋め込み。  
    参照: `src/components/editor/MainEditor.tsx:443`
  - サーバ側は query 埋め込み1本のみ（`targetEmbeddings=[embedding]`）。  
    参照: `functions/src/search.ts:295`
- 対処:
  - query側も salient化（キーワード/主張を3〜5本抽出して multi-query）。
  - セクションが長すぎる場合は先に圧縮（要約またはキーセンテンス化）。

### D. Deterministic ranking で「同じ入力→同じ出力」
- 症状: 同じ編集位置では提案がほぼ変化しない。
- 根拠:
  - ランキングは決定的（`score -> bestRank`）でランダム性なし。  
    参照: `functions/src/search.ts`
- 対処:
  - 上位候補内で軽いランダム化（例: top10から5件を重み付きサンプル）。
  - クライアント側で「直近表示ノート」を一定期間ペナルティ。

### E. 削除ノート由来の orphan サブコレクション
- 症状: 上位候補が欠落し、結果セットが狭まりやすい。
- 根拠:
  - ノート削除は `notes/{id}` だけ削除し、サブコレクション削除なし。  
    参照: `src/components/pages/NoteEditorPage.tsx:124`
  - 検索は `salientItems` を先に順位付けしてから `notes` を読むため、orphan が上位を占有し得る。  
    参照: `functions/src/search.ts:149`, `functions/src/search.ts:214`, `functions/src/search.ts:223`
- 対処:
  - note削除トリガーで `sections`/`salientItems` をクリーンアップ。
  - 返却前の oversampling（例: top20 noteId 抽出→存在確認→top5確定）。

## 3. 優先対処案（実行順）

### P0（即日）
1. `backfill:salient` を全体実行し、母集団偏りを解消。
2. 運用ログ追加:
   - `searchRelated` で `candidate_note_count`, `valid_note_count`, `orphan_drop_count` を出す。
3. 返却ロジックを `top5` 固定切りにせず、存在確認後に5件埋まるまで補完。

### P1（短期）
1. 多様化（MMR or 直近表示ペナルティ）を導入。
2. query側 salient抽出（multi-query）を導入。
3. 返却前に valid note が5件埋まるまで候補を補完する。

### P2（中期）
1. note削除時のサブコレクション掃除を自動化。
2. A/Bで `EUCLIDEAN` と `COSINE` の比較検証。

## 4. 最小実装で効く改善セット（推奨）
- セットA:
  - 全ノート backfill
  - 返却前に top10 から MMR で top5 選定
- 期待効果:
  - 「いつも同じノート」問題を最小改修で下げやすい。

## 5. すぐ見るべき確認項目
- `salientUpdatedAt` が入っているノート比率
- `searchRelated` 1回あたりの「ユニーク note 候補数」
- 上位5件の重複率（セッション内/日次）
