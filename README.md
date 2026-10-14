# ourlifeplanning

家族のライフプランを可視化する Web アプリ（プロトタイプ）。

> このリポジトリは公開されています。個人の数字はコードやドキュメントに書かず、アプリの画面から入力してください（入力した値はブラウザにだけ保存されます）。

## ドキュメント
1. [目的・スコープ](docs/01_purpose.md)
2. [要件定義](docs/02_requirements.md)
3. [ドメイン設計（計算モデル）](docs/03_domain_model.md)
4. [システム設計](docs/04_system_design.md)

## 動かし方
```sh
cd app
npm install
npm run dev      # 開発サーバー
npm test         # 計算エンジンのテスト
npm run build    # 本番用ビルド（dist/）
```
