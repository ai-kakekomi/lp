# AIかけこみ寺 LP

非営利団体 AIかけこみ寺の公式サイト [ai-kakekomi.com](https://ai-kakekomi.com) のソースコードです。

## ミッション

**AIの恩恵をすべての人へ。** ひとりひとりに届く無料AI教室を、全国へ。

## 技術スタック

- HTML / CSS / JavaScript（vanilla）
- ビルドステップなし
- Cloudflare Workers（静的アセット）でホスティング（`master` への push で自動デプロイ）

## ローカルで動かす

```bash
git clone https://github.com/ai-kakekomi/lp.git
cd lp
# ブラウザで index.html を開くだけ
```

## 貢献

改善提案・バグ報告は [Issue](https://github.com/ai-kakekomi/lp/issues/new/choose) から。
PRも歓迎です。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

## 寄附フォームの暫定運用

`kifu.html` からSupabaseの `submit_donation_notice` を直接呼ぶ。
LP・internalとも受付APIやTurnstileは追加していない。
`SUPABASE_KEY` は空欄のままなので、現在は準備中となり送信できない。
運用前に対象プロジェクトのpublishable keyだけを設定する。管理者の鍵は絶対に置かない。
公開キーは `apikey` ヘッダーで送り、JWTとしてBearer送信しない。

公開前にinternalの `20261104000000_donation_notice_validation.sql` を適用し、
実際のLPから保存できることを架空データで確認する。DBの表への直接アクセス禁止は維持する。
全体30件/10分で一時停止するが、botや大量アクセスを止めるものではない。
失敗時は入力を残す。通信障害で結果が不明の場合は重複送信を避けるため問い合わせを案内する。

氏名・住所は認定申請、日付・金額・振込名義は入金確認、任意のメールは受領証送付に使う。
月1回の印刷・印刷後削除のスクリプトは別保管で未確認。運用前に対象行・PDF・一時ファイルを
印刷完了後に削除できることを確認する。受領証送付も別途運営が行う。

フォームの確認は `node --test --test-isolation=none tests/donation-notice.test.mjs`。
DOMと通信を模擬したテストであり、本番のキーやデータを使わない。

## ライセンス

Copyright (c) 2025-2026 AIかけこみ寺. All rights reserved.
