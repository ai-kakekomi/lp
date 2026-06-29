# コントリビューションガイド

AIかけこみ寺 LP（ai-kakekomi.com）への貢献方法です。

## Issues で提案・報告

- **機能提案**: サイトの改善案を Issue で教えてください
- **バグ報告**: 表示崩れや動作不具合を見つけたら報告してください

[Issue を作成する →](https://github.com/ai-kakekomi/lp/issues/new/choose)

## Pull Request で直接貢献

### セットアップ

```bash
git clone https://github.com/ai-kakekomi/lp.git
cd lp
# ビルド不要。ブラウザでindex.htmlを開くだけ
```

### PR の流れ

1. `master` から作業ブランチを切る
2. 変更を加え、ブラウザで動作確認
3. PR を作成
4. レビュー後マージ（Vercel が自動デプロイ）

### 技術スタック

- HTML / CSS / JavaScript（vanilla）
- Vercel でホスティング
