# AI 開発向けガイド

調査基準: 2026-09-23 の `origin/main`。ここに記すのはリポジトリ内の実装であり、デプロイ済み環境の状態ではない。

## プロダクトと作業の入口

Titanium は、ノートを書き、関連ノートを発見し、AI の Mix で新しいアイデアを得る Web アプリ。本文の正本は `notes.markdown`。関連検索用の埋め込み、セクション、salient item は派生データ。Mix の結果は提案として表示し、ユーザーが保存したときだけ新しいノートになる。UX の判断には `docs/ux.md` と `src/AGENTS.md` を使う。

タスク管理は [GitHub Project「Titanium 開発」](https://github.com/users/k5trismegistus/projects/5) の Todo / In Progress / Done ボードを使う。ボードは手動管理で、既存 Issue の一括取り込みと Open Issue の自動追加はしない。着手時に関連 item と Issue を確認し、必要な作業だけを追加する。個人開発の現時点では PR は必須ではない。

## 実装マップ

| 場所                                                                   | 役割                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/App.tsx`                                                          | ノート一覧、編集、読み取り専用デモのルーティング            |
| `src/components/editor/MainEditor.tsx`                                 | WYSIWYG / Markdown の切り替えと現在のセクション管理         |
| `src/components/editor/RichTextEditor.tsx`, `MarkdownEditor.tsx`       | 各編集モードの入力                                          |
| `src/components/editor/editorMarkdown.ts`, `editorSections.ts`         | Markdown の往復変換、空行保持、カーソル位置のセクション抽出 |
| `src/hooks/useSync.ts`                                                 | ノートの読込と Firestore への自動保存                       |
| `src/components/suggestions/SuggestRail.tsx`                           | 関連候補、モバイルの全画面ドロワー、Mix の選択              |
| `src/components/pages/NoteEditorPage.tsx`                              | Mix の実行、結果の保存、ノート削除                          |
| `functions/src/triggers.ts`                                            | 本文更新後の埋め込み、セクション、salient item 生成         |
| `functions/src/search.ts`                                              | Firestore vector search による関連検索とノート検索          |
| `functions/src/mix.ts`, `quickWord.ts`                                 | Gemini による生成                                           |
| `functions/src/embedding.ts`, `randomProjection.ts`, `vectorConfig.ts` | 埋め込み生成と 2048 次元への射影                            |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json`           | 権限と検索用 index                                          |

フロントは React 19 / TypeScript / Vite、バックエンドは Firebase Auth / Firestore / Storage / Functions / Hosting。Functions は Node 22 を指定する。Firebase 以外のアプリ向けサービスを追加する場合は、ルートの `AGENTS.md` にある承認条件を守る。

## データの流れと守るべき条件

1. フロントは `notes/{noteId}` の `markdown` と `category` を保存する。WYSIWYG と Markdown を切り替えても、本文を意図せず書き換えない。単独の改行は表示上も改行として扱う。
2. `onNoteWritten` が本文変更に応じてノートの埋め込みと子コレクションの `sections` / `salientItems` を更新する。Firestore vector search の上限は 2048 次元で、保存時と検索時に同じ射影を使う。
3. `searchRelated` は編集中の文脈から salient item の近傍検索を行い、必要に応じてノート単位の検索へ戻る。候補はユーザーのノートに限定する。モバイルでは関連候補を全画面ドロワーに表示する。
4. `mix` はユーザーが所有するノートを読み、生成した Markdown を返す。保存はフロントの明示操作。`quickWord` は生成後にノートを作成する。

Callable Functions は Admin SDK を使うため Firestore Rules を通らない。認証、`allowedUsers`、ノート所有権の確認は各 Callable でも必要。変更時は `functions/AGENTS.md` を参照する。

## 検証と既知の確認事項

ルートで `npm run lint`、`npm run format:check`、`npm run build`、Functions は `npm --prefix functions run build` を使う。既存の lint 警告も見るときは `npm run lint:all`。自動修正は `npm run lint:fix`、整形の適用は `npm run format`。テストと CI は未導入。

- `storage.rules` は現在、認証済みなら全パスの読み書きを許可する。画像やノートの所有権と照らした Rules テストが必要。
- `searchRelated` は `searchNotes` と違い、入口で `allowedUsers` を確認しない。Callable の認可テストで確認する。
- フロントのノート削除は親ドキュメントを削除する。子コレクションの後始末と検索候補の整合性を確認する。
- `reindex` と `backfill:salient` は実データを更新し得る。対象 Firebase Project、ユーザー、件数、費用を確認してから実行する。

将来のツール整備は `docs/ai-tooling-plan.md` に記す。構想時の設計文書と現在の実装が違う場合は、コードと実行結果を確認し、文書側にその差を明示する。
