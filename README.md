# 収支管理アプリ

Vercel（フロントエンド）+ GAS API（バックエンド）+ Google スプレッドシート（データ）

## セットアップ手順

### Step 1: GAS API をデプロイする

1. 収支管理に使っているスプレッドシートを開く
2. メニュー → 拡張機能 → Apps Script
3. `gas/Code.gs` の内容をすべてコピーして貼り付ける
4. 2行目の `YOUR_SPREADSHEET_ID_HERE` をスプレッドシートのIDに置き換える
   - スプレッドシートのURL: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
5. 「デプロイ」→「新しいデプロイ」をクリック
6. 種類：「ウェブアプリ」を選択
7. アクセスできるユーザー：「自分のみ」
8. 「デプロイ」をクリック → 表示されるURLをコピー

### Step 2: ローカル環境を構築する

```bash
# プロジェクトフォルダに移動
cd expense-tracker

# パッケージをインストール
npm install

# 環境変数を設定
cp .env.local.example .env.local
# .env.local を開いて GAS の URL を貼り付ける

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセスして動作確認。

### Step 3: GitHub にプッシュする

```bash
git init
git add .
git commit -m "初回コミット"

# GitHubで新規リポジトリを作成してから：
git remote add origin https://github.com/あなたのユーザー名/expense-tracker.git
git branch -M main
git push -u origin main
```

### Step 4: Vercel にデプロイする

1. https://vercel.com にログイン（GitHub連携）
2. 「Add New Project」→ GitHubリポジトリを選択
3. Environment Variables に以下を追加：
   - `NEXT_PUBLIC_GAS_URL` = Step 1 でコピーしたGAS URL
4. 「Deploy」をクリック

以降、コードを変更して `git push` するだけで自動デプロイされます。

### Step 5: スマホにインストールする（PWA）

1. スマホのブラウザでVercelのURLにアクセス
2. iOS: 共有ボタン →「ホーム画面に追加」
3. Android: メニュー →「ホーム画面に追加」

---

## 開発フロー

```
コード修正 → localhost で確認 → git push → Vercel が自動デプロイ
```

ローカルで `npm run dev` している間は、ファイルを保存するだけで即座に画面に反映されます（ホットリロード）。

## GAS API の更新

GAS側のコードを変更した場合は、Apps Script エディタで再デプロイが必要です：
1. 「デプロイ」→「デプロイを管理」
2. 鉛筆アイコン → バージョン「新バージョン」→「デプロイ」

## ファイル構成

```
expense-tracker/
├── app/
│   ├── globals.css      # スタイル（モバイルファースト）
│   ├── layout.js        # ルートレイアウト
│   └── page.js          # メイン画面（全ビュー）
├── components/
│   └── BalanceChart.js   # Chart.js グラフコンポーネント
├── lib/
│   ├── api.js            # GAS API クライアント
│   └── utils.js          # ユーティリティ関数
├── gas/
│   └── Code.gs           # GAS バックエンド（別途デプロイ）
├── public/
│   └── manifest.json     # PWA マニフェスト
├── .env.local.example    # 環境変数テンプレート
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```

## トラブルシューティング

### GASに接続できない
- `.env.local` の URL が正しいか確認（末尾は `/exec`）
- GAS のデプロイで「アクセスできるユーザー」が正しく設定されているか確認
- CORS エラーが出る場合：GAS のウェブアプリURLに直接ブラウザでアクセスしてJSON が返るか確認

### デモモードで表示される
- GAS URL が未設定 or 接続失敗の場合、自動的にデモデータで表示されます
- `.env.local` を設定して `npm run dev` を再起動してください
