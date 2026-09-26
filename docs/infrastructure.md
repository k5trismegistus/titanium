# インフラ選定まとめ（メモアプリ）

## 結論

本プロダクトの初期インフラは

**Firebase + Gemini API** を採用する。

---

## 前提条件（再確認）

- Markdownベースのノートアプリ
- AIによる整理・類似提示・Mix生成が中核価値
- 章（見出し）単位でのEmbedding・類似検索
- モバイルファーストの編集体験
- RDBは使わない
- 時間課金なし、完全従量課金
- 個人開発〜小規模スタートを想定

---

## Firebaseを選択した理由

### 1. 開発スピードと体験優先

- Auth / Storage / Functions / Hosting が揃っている
- モバイル向けUI・編集体験を作りやすい
- 思考支援・創発体験の検証を最速で行える

### 2. コスト設計が要件に合致

- Firestore / Cloud Functions / Storage は従量課金
- アイドル時の固定費がほぼ発生しない
- 個人開発でも心理的・金銭的負担が小さい

### 3. AI連携との親和性

- Gemini API と自然に統合できる
- Mix機能やカテゴリ別アウトプット変換に十分な性能
- MVP段階ではEmbedding・生成ともに過不足なし

---

## Firebaseの弱点と割り切り

### ベクトル検索の制約

- Firestore単体では高性能な近傍探索ができない
- MVPでは以下で妥協する：
  - データ量を絞った類似計算
  - Cloud FunctionsでのTop-K近似

### 将来への対応

- ベクトル検索のみ外部サービスに切り出し可能
  - Pinecone / Weaviate / Qdrant 等
- 設計次第で AWS への移行も可能

---

## 他候補との比較（要点）

- AWS Serverless
  - 拡張性は高いが初期設計コスト・最低コストが重い
- Supabase
  - pgvectorは魅力だがRDB前提で思想とズレる
- Cloudflare Stack
  - 思想的には合うが実装難易度が高い
- Vercel中心構成
  - UIは強いが構成が分散しやすい

→ **初期フェーズではFirebaseが最もバランスが良い**

---

## 採用方針まとめ

- 初期：Firebase + Gemini API
- 文章生成：東京リージョンの Firebase Functions から Vertex AI の `gemini-3.8-flash` を global 接続先で呼ぶ。Mix・単語補完・派生テキスト・選択範囲の展開で共通化する。
- ファクトチェック：同じ Functions で認証と `allowedUsers` を検証してから Google Search grounding を使う。検索結果の出典と Search Suggestions を画面に表示し、根拠が得られない回答は検証済みとして扱わない。Firebase AI Logic の Web 直呼びでは既存のホワイトリストをサーバー側で強制できないため、既存のサーバー経由を維持する。
- 記事支援：東京リージョンの Callable `articleAssist` が全文レビュー、全文ファクトチェック、過去ノートの素材、見出し・導入・結びを提供する。レビュー等は構造化 JSON の少数候補を返し、クライアントで個別確認する。過去ノートは既存の関連検索で得た ID を受け取り、Function 側で各ノートの `userId` を照合してから生成に渡す。AI ジョブと候補は保存しない。
- 埋め込み：`gemini-embedding-001` と Firestore 向け 2048 次元への投影を維持し、再生成しない。
- モデルと出典表示の実装根拠：[Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)、[Grounding with Google Search](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-search)。
- 重視するもの：
  - 体験
  - 試行錯誤の速さ
  - 完走できる現実性
- 将来：
  - ベクトル検索や基盤は段階的に差し替え可能
