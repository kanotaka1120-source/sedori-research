# セドリサーチ v1（PWA）

写真・バーコードから商品を特定し、売れた相場と手数料・送料・ポイント込みの利益で仕入れを判定するリサーチアプリ。
v1は自分専用。データは端末のブラウザに保存（設定 → バックアップでJSON書き出し）。

## 構成
| 場所 | 役割 |
|---|---|
| `index.html` `css/` `js/` | アプリ本体（PWA）。フレームワークなし、ビルド不要 |
| `js/calc.js` | 利益・ポイント・注意ワードの計算（GAS版からの移植、テスト済み） |
| `js/store.js` | 保存層（IndexedDB）。v2でSupabaseアダプタに差し替える |
| `js/ai.js` | AI呼び出し。中継サーバー `/api/ai` か、claude.ai上のプレビューではページ内のClaude |
| `js/scan.js` | バーコード読み取り（ライブ＋写真） |
| `api/ai.js` | Vercelサーバーレス関数。Claude APIキーはここだけが持つ |
| `supabase/schema.sql` | v2用のテーブルとRLS |
| `vendor/zxing.min.js` | バーコード解析ライブラリ（@zxing/library 0.21.3） |

## 使い方（アプリ）
1. 調べる：📷バーコード／🤖写真でAI特定／🖼スクショを読む（メルカリ売り切れやSNSのスクショ→相場を自動入力）
2. 検索ボタンで売れた実績・仕入れ先・SNSを開いて確認
3. 判定：仕入先・仕入価格・相場を入れる → 利益・利益率・仕入上限・◎買い／△薄利／×赤字。AIに理由を聞ける
4. 候補に保存 or 仕入れた → 在庫・実績で状態を更新（売却済＋実売価格で実利益が出る）
5. ホームで今月の利益・予算消化・ポイント日を確認

## デプロイ（Vercel・約15分）
1. GitHubにこのフォルダをpush（または Vercel CLI で `vercel` を実行）
2. Vercelで「New Project」→ そのリポジトリを選ぶ。Framework Preset は Other、Build Command なし、Output Directory は `.`
3. Environment Variables に次を設定
   - `ANTHROPIC_API_KEY`：Anthropic Console（https://console.anthropic.com/）で発行したキー
   - `APP_TOKEN`：自分だけが使うための合言葉（任意の文字列）。v1では未使用でも可
   - `AI_MODEL`（任意）：既定は `claude-sonnet-4-5`
4. Deploy → 発行されたURLをスマホで開き「ホーム画面に追加」
5. 設定 → API・AI の「AI中継URL」が `/api/ai` のままならそのまま動く

## AIの費用（無料で回す）
呼び出し順：**自分のGemini無料キー（Flash-Lite → Flash）→ 自分のGroq無料キー → ページ内Claude／中継サーバーの有料Claude**。
- Geminiキー：Google AI Studio（https://aistudio.google.com/apikey）→「APIキーを作成」→ アプリの設定に貼る。無料枠の目安は1日 Flash-Lite 500回・Flash 20回（Googleの枠は変わる。送った内容はGoogleの改善に使われる）
- 枠を使い切ると自動で次へ。全部ダメなら画面に理由が出る
- 有料Claude（中継）は保険。写真1枚で1〜3円
- 販売時：無料ユーザーは自分のGeminiキーを入れてもらう（原価0円）、有料プランは中継のClaudeを使う

## v2（販売用）に進む時の作業
- Supabase プロジェクトを作成 → `supabase/schema.sql` を実行 → Auth で Google ログインを有効化
- `js/store.js` に Supabase アダプタを追加（同じ関数名で差し替え）
- `api/ai.js` で Supabase の JWT を検証し、`ai_usage` に利用量を記録（TODO コメントの箇所）
- Stripe で月額プラン、プランごとにAI回数上限
- 特定商取引法の表記・利用規約・プライバシーポリシー

## 守ること
- メルカリ・ヤフオク・SNS・中古ショップは自動収集しない（リンクで開く／スクショをAIが読む）
- 楽天・Yahoo!のAPIキーはユーザー自身のものを使う
- 「稼げる」と断定する表現を使わない
