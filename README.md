# AI Swimmers Note Demo

ローカルの Ollama (`gemma4:26b` を想定) を使って、スイミングの練習ノートを作成・保存し、AI（コーチ向けアシスタント）に練習メニューの良い点・改善点・具体的修正案をコメントさせるデモリポジトリです。

セットアップ

```bash
cd ~/Documents/AI-swimmers-note-demo
npm install
npm start
# ブラウザで http://localhost:3002 を開く
```

仕様
- サーバー: `server.js` (Express)
- フロント: `public/index.html` (シンプルな作成 + コメントUI)
- DB: `data/swimmers.db` (SQLite)

主なエンドポイント
- `POST /api/practice` : `{ title, content, sessionId }` -> 作成し `id` を返す
- `GET /api/practice/:id` : 練習データと保存済みコメントを返す
- `POST /api/comment` : `{ practiceId, sessionId }` -> Ollama に練習を渡してコメントを生成し、`comments` テーブルに保存

注意点
- `GEMMA_MODEL` 環境変数で利用モデルを切り替え可能（既定: `gemma4:26b`）
- モデル呼び出しはローカル Ollama (`http://localhost:11434/v1/chat/completions`) に対して行います。Ollama が別ホスト/ポートの場合は `server.js` を編集してください。
- 履歴（`practices` / `comments`）は `data/swimmers.db` に保存されます。不要なら DB を削除するか、エンドポイントを追加して削除操作を実装してください。

開発・運用アイデア
- コーチ用認証を追加して練習の信頼性を確保する
- 自動要約・過去履歴を取り込むロジックで練習プラン改善を継続的に提案
- コメントの構造化（良い点 / 改善点 / 修正案 を JSON で返す）
