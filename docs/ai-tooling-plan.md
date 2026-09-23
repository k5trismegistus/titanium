# AI 開発向けツール整備計画

調査基準: 2026-09-23 の `origin/main`。実装済みと今後の候補を分けて記す。

## 実装済み

- ESLint / Prettier をルートの開発依存に追加し、`eslint.config.js`、`.prettierrc.json`、`.prettierignore` を配置した。
- `npm run lint`、`lint:all`、`lint:fix`、`format`、`format:check` を追加した。通常の lint はエラーを検出し、移行中の警告は `lint:all` で確認する。
- `origin/main` の既存コードを整形し、lint・整形チェック・フロントと Functions のビルドを実行する。
- GitHub Project「Titanium 開発」は Todo / In Progress / Done の手動管理とした。Issue の自動追加は無効。必要な作業だけを手動で関連付ける。

## 次の候補

| 優先   | 整備                                    | 完了条件                                                                                              |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1      | Node バージョンの明示                   | Functions の Node 22 指定とローカル・README の手順をそろえる                                          |
| 2      | Firebase Emulator Suite と Rules テスト | Auth / Firestore / Storage / Functions を本番から分離し、未認証・所有者・別ユーザーのケースを検証する |
| 3      | 重要な編集・検索処理のテスト            | WYSIWYG / Markdown 切り替えの本文保持、2048 次元への射影、候補集約、Mix の保存境界を検証する          |
| 後回し | GitHub Actions と Hosting preview       | 複数人開発や PR レビューが必要になった時点で検討する                                                  |

Emulator のテストでは AI の外部呼び出しをスタブ化し、誤って本番 Firebase Project に接続しない設定を用意する。Functions は Admin SDK によって Rules を迂回するため、Callable の認可テストを別に置く。PR や Kanban の項目は、この計画を記しただけでは作成しない。
