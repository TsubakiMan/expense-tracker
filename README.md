# Money Flow（収支管理アプリ）

Vercel（フロントエンド）+ Supabase（データベース）

- 月ごとの収支をカテゴリ別に記録し、残高の予測やシミュレーションができるスマホ向けアプリ
- 機能・画面構成・データ構造・既知の課題は [HANDOFF.md](HANDOFF.md) を参照
- リポジトリ: https://github.com/TsubakiMan/expense-tracker（ブランチ `master`）

> **開発を引き継ぐ人へ**: まず [HANDOFF.md](HANDOFF.md) の「§0 引き継ぎの要点」を読むこと。今の状態、開発するときの注意、持ち主に確認が必要なこと、次にやることをまとめてある。

> 以前は Google Apps Script（GAS）+ スプレッドシートを使っていたが、Supabase に移行済み。`gas/Code.gs` はその頃のコードで、今は使っていない。

## セットアップ手順

### Step 1: Supabase を用意する

1. https://supabase.com でプロジェクトを作る（既存のプロジェクトを使う場合はそのまま Step 2 へ）
2. SQL Editor で、下の「テーブル定義」を実行してテーブルを作る
3. プロジェクト設定の API の画面から、次の2つを控える
   - Project URL
   - anon（public）キー

#### テーブル定義

> ⚠ リポジトリには本番のテーブル定義が残っていない。以下は `lib/api.js` から組み立てた定義で、本番と型や制約が違う可能性がある。本番の定義は Supabase の管理画面で確認すること。

```sql
-- 月ごとのデータ（1行 = 1か月）
create table monthly_data (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  date            text not null,        -- 'YYYY-MM'（アプリは文字列として比べる）
  -- 収入
  salary          bigint default 0,     -- 給与
  side_income     bigint default 0,     -- 副収入
  other_income    bigint default 0,     -- その他収入
  -- 支出
  rent            bigint default 0,     -- 家賃
  food            bigint default 0,     -- 食費
  electric        bigint default 0,     -- 電気
  gas             bigint default 0,     -- ガス
  water           bigint default 0,     -- 水道
  phone           bigint default 0,     -- 通信費
  subscription    bigint default 0,     -- サブスク
  transport       bigint default 0,     -- 交通費
  daily           bigint default 0,     -- 日用品
  insurance       bigint default 0,     -- 保険
  loan            bigint default 0,     -- ローン
  hobby           bigint default 0,     -- 趣味・娯楽
  beauty          bigint default 0,     -- 美容
  other_expense   bigint default 0,     -- その他
  extra_expense   bigint default 0,     -- 臨時支出
  -- 月末の口座残高
  balance_hokyo   bigint default 0,     -- 北洋銀行
  balance_rakuten bigint default 0,     -- 楽天銀行
  notes           text default '',      -- 備考
  custom_data     jsonb                 -- 追加したカテゴリの金額 例: {"cx_1": 3000, "ci_1": 50000}
);

-- 設定（カテゴリ名・並び順・グループ・スケジュールなど）
create table settings (
  key        text primary key,          -- customLabels / categoryConfig / expenseGroups / customCategories / categorySchedule
  value      jsonb,
  updated_at timestamptz default now()
);
```

#### セキュリティについて

このアプリにはログイン機能がなく、ブラウザから anon キーで Supabase に直接読み書きする。anon キーはブラウザに配られるので、**RLS（行単位のアクセス制御）を設定していないと、URL とキーを知っている人なら誰でもデータを読み書きできる**。公開する前に Supabase 側のアクセス制御を確認すること。

### Step 2: ローカル環境を作る

```bash
# パッケージをインストール
npm install

# 環境変数のファイルを作る
cp .env.local.example .env.local
# .env.local を開いて、Step 1 で控えた URL と anon キーを貼り付ける

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開いて動作を確認する。

> ⚠ **本番のデータに注意**: `.env.local` に本番と同じ Supabase の URL・キーを入れると、ローカルで保存した内容がそのまま本番のデータに反映される。データを書き換える確認は、テスト用の Supabase プロジェクトを別に作り、その URL・キーを `.env.local` に入れて行うのが安全。

### Step 3: Vercel にデプロイする

1. https://vercel.com で GitHub リポジトリをプロジェクトとして取り込む（取り込み済みならそのまま）
2. Environment Variables に次の2つを設定する
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon キー
3. デプロイする

以降は `master` に `git push` すると自動でデプロイされる。

### Step 4: スマホのホーム画面に追加する（PWA）

1. スマホのブラウザで Vercel の URL を開く
2. iPhone: 共有ボタン →「ホーム画面に追加」
3. Android: メニュー →「ホーム画面に追加」

※ Service Worker はないので、オフラインでは使えない。

---

## 開発の流れ

```
コードを直す → localhost で確認 → git push → Vercel が自動でデプロイ
```

`npm run dev` を動かしている間は、ファイルを保存するとすぐ画面に反映される。

- 画面とロジックのほとんどは `app/page.js` 1ファイルにある。どの処理が何行目にあるかは HANDOFF.md の「§9 コードの場所」を参照。
- テスト・TypeScript・Lint の仕組みはない。計算まわりを変えたら、ホーム・一覧・予測の各画面で数字を確認する。
- `.env.local` には接続情報が入っているのでコミットしない（`.gitignore` 済み）。

## ファイル構成

```
expense-tracker/
├── app/
│   ├── globals.css       # 全スタイル（スマホ向け。画面幅は最大430px）
│   ├── layout.js         # ルートレイアウト（メタ情報・PWA設定）
│   └── page.js           # アプリ本体（全画面・全ロジック）
├── components/
│   └── Charts.js         # グラフ（ドーナツ / 残高予測の折れ線 / 収支の棒）
├── lib/
│   ├── api.js            # Supabase との読み書き（カラム名の変換を含む）
│   ├── supabase.js       # Supabase クライアントの生成
│   └── utils.js          # カテゴリ定義・金額の表示形式・合計の計算
├── gas/
│   └── Code.gs           # 旧 GAS バックエンド（未使用）
├── public/
│   ├── manifest.json     # PWA マニフェスト
│   └── icon-192.png / icon-512.png
├── .env.local.example    # 環境変数のひな形
├── HANDOFF.md            # 引き継ぎ資料（機能・画面・データ構造・課題）
├── next.config.js
├── package.json
└── README.md
```

## トラブルシューティング

### 画面が真っ白になる / 起動時にエラーが出る
- `.env.local`（Vercel では Environment Variables）に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が入っているか確認する
- この2つが空だと、Supabase のクライアントを作る時点でエラーになり、画面が出ない
- `.env.local` を変えたら `npm run dev` を起動し直す

### 「DEMO MODE」と表示される
- Supabase からデータを取れなかったときは、サンプルデータで表示する（保存はされない）
- URL・anon キーが正しいか、テーブル `monthly_data` と `settings` があるか、Supabase のアクセス制御で読み取りが止められていないかを確認する

## 既知の課題（主なもの）

全20件の詳細は HANDOFF.md の「§8 既知の課題・注意点」を参照。

- **新しい月を画面から追加できない**: データが1件でもあると、入力画面の保存は既存の月への上書きになる（課題1）
- **ログイン機能がない**: Supabase のアクセス制御（RLS）の設定次第では、誰でも読み書きできる（課題13）
- **本番のテーブル定義がリポジトリにない**: 上の「テーブル定義」は推定版（課題14）
- 予測・補正の計算が画面によって食い違う箇所がある（課題5・6）

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-11-08 | 引き継ぎ資料 `HANDOFF.md` を追加 |
| 2026-11-08 | README と `.env.local.example` を Supabase 構成に書き直し |
| 2026-11-08 | ホームの金額編集で追加カテゴリを保存すると、同じ月のほかの追加カテゴリの値が消えるバグを修正（`lib/api.js` の `updateRow`） |
| 2026-04-11 以前 | 開発の経緯は `git log` を参照（GAS + スプレッドシートから Supabase への移行はコミット `ea31242`） |
