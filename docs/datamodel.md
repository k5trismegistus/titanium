# データモデル設計（最終確定版）

※ Firebase単独 / 非同期Embedding / h1単位 / Mixは生成のみ

---

## 設計方針（前提）

- Firebase単独構成
- RDB不使用
- Markdown全文を Single Source of Truth とする
- 章（section）は h1 単位
- Embedding更新は非同期
- Mixは「新しいノート候補テキストを生成するだけ」
    - 参照関係・履歴は保持しない
- UXは後回し（データ整合性と単純さを優先）

---

## コレクション一覧

```
users
notes
sections
```

## users

```tsx
users/{userId} {
  createdAt
  updatedAt
  categories: string[] // 例: ["Qiita", "広報ブログ"]
}

```

- Auth用
- カテゴリはユーザーごとに保持する

---

## notes（編集の真実）

```tsx
notes/{noteId} {
userId:string
title:string
category:string
markdown:string// Markdown全文（唯一の真実）
noteEmbedding:number[]// ノート全体Embedding（保存ごとに更新）
sectionIndex: [
    {
sectionId:string
heading:string
order:number
    }
  ]
  createdAt
  updatedAt
}

```

### 設計意図

- Markdown全文のみが編集対象
- 差分管理はしない（全文上書き）
- WYSIWYG と Markdown は同一の `notes.markdown` を表示・編集するだけで、モード切替では本文を書き換えない
- 単改行は titanium 独自仕様として改行として扱い、そのまま `notes.markdown` に保存する
- Mixで生成されたノートも通常ノートと同一扱い
- 履歴管理・参照関係は持たない
- category は users.categories から選択する

---

## sections（AI・検索用派生データ）

```tsx
sections/{sectionId} {
userId:string
noteId:string
heading:string// h1 見出し
content:string// 次の h1 まで（h2以下含む）
order:number
embedding:number[]// h1単位Embedding
embeddingPending:boolean// 非同期更新中フラグ
  updatedAt
}

```

### 設計意図

- h1単位のみを section とする
- sections は notes.markdown から常に再生成可能な派生データ
- 検索・サジェスト・Mix入力の最小単位
- heading の一意性は要求しない
- section 削除時は即 delete（deprecated は持たない）

---

## Markdown更新時のデータ更新ルール

1. notes.markdown を全文保存
2. Cloud Functions が Markdown をパース
3. h1単位で sections を再構築
4. 各 section について：
    - heading / content / order を更新
    - 内容が変わった section のみ `embeddingPending = true`
5. noteEmbedding は毎回更新
6. sectionIndex を notes に同期

---

## Embedding運用方針

### 種類

- **noteEmbedding**
    - ノート全体の意味
    - ノート × ノート類似用
    - 保存ごとに毎回更新
- **section.embedding**
    - 編集中サジェスト / 類似章提示用
    - h1単位
    - 差分があった章のみ非同期更新

---

## 非同期更新による不整合の扱い

- 古いEmbedding経由で
    - 存在しない sectionId が参照される可能性はある
- その場合：
    - ノートは必ず開く
    - セクションジャンプはしない
    - 「この章は削除されました」アラートのみ表示
- deprecated / tombstone は保持しない

---

## Mix機能の扱い（明確な割り切り）

- Mixは以下のみを行う：
    - 複数 section / note から
    - 新しいノート候補テキストを生成
- フロント側で：
    - 良ければ通常ノートとして保存
    - 不要なら保存しない
- 元ノート・元sectionへの参照は一切保持しない

---

## 削除ルール

### ノート削除

- notes 削除
- sections は cascade delete

### セクション削除

- Markdown再構築時に即 delete
- Mix・履歴用途では使用しない

---

## 採用しない設計（明示）

- ❌ Mix中間モデル
- ❌ ノート / セクション履歴管理
- ❌ deprecated / tombstone 管理
- ❌ 外部ベクトルDB
- ❌ マルチプラットフォーム構成

---

## このデータモデルの狙い

- 思考の自由度を下げない
- Firebase単独で破綻しない
- 従量課金を守る
- 実装・運用をシンプルに保つ
- 後からの仕様追加に耐える
