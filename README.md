# INKLOOM

ブラウザだけで画像をリソグラフ風の複数インク版へ分解し、網点・紙・版ズレを調整して書き出す画像加工ラボです。入力画像はサーバーへ送信せず、ブラウザ上のCanvasで処理します。

> 実際のリソグラフ印刷や特定アプリの出力を完全に再現するものではありません。印刷の色分解・網点・紙目の考え方を取り入れた、制作向けのシミュレーターです。

## 主な機能

- 1〜6色のインク版を追加し、版ごとにパレットからインクを選択
- `AUTO` による画像の主要色を基にしたインク候補の自動選択
- 印刷色の吸収と紙色を考慮した、OKLabベースの多色分解
- `SCREEN`（格子状網点）と `GRAIN`（点描）の2つの階調表現
- Dot on Dot / Offset / Rosette のスクリーン角度方式
- 版ごとの周波数、角度、濃度、ドットゲイン、版ズレ、ワープなどを調整する `CUSTOMIZE` モード
- Warm White / Natural / Recycled Gray / Kraft / White の紙プロファイル
  - 紙色だけでなく、粒子、繊維、インク受容ムラをレンダーへ反映
- 組み込みの印刷レシピ8種と、ブラウザ内へ保存できる名前付きプリセット
- フレーム比率、CROP / FIT、プレビュー倍率（FIT / 100% / 200% / 300%）
- PNG / JPGの完成画像、または各インク版の分版PNGを書き出し

## 紙プロファイル

| 紙 | sRGB | 粒量 | 粒スケール | 繊維量 | インク受容ムラ |
| --- | --- | ---: | ---: | ---: | ---: |
| Warm White | `#F4EEDC` | 5% | 0.35 mm | 50% | 8% |
| Natural | `#E9DFC8` | 5% | 0.35 mm | 50% | 8% |
| Recycled Gray | `#DDD8C9` | 5.5% | 0.44 mm | 48% | 10.5% |
| Kraft | `#BF9C6B` | 5% | 0.55 mm | 62% | 10% |
| White | `#FFFFFF` | 0% | 0.35 mm | 0% | 2% |

## ローカル起動

必要環境: Node.js 22.13以上

```bash
npm install
npm run dev
```

起動後、表示されたローカルURL（通常は `http://localhost:3001`）を開いてください。

## 検証

```bash
npm test
npm run lint
npm run build
```

## 処理の流れ

```text
input image
  → frame crop / fit
  → linear RGB + brightness / contrast
  → paper-aware OKLab ink separation
  → per-plate screen or grain
  → ink acceptance / dot texture / registration
  → subtractive composite on paper
  → preview or export
```

プレビューと書き出しは同じ処理パイプラインを使います。元画像のピクセル寸法ではなく、選択したフレーム比率と出力サイズで再描画します。

## プリセットの保存について

`PRESET` から保存した内容は、インク、紙、網点、カスタム設定、フレーム設定を含みます。保存先は現在のブラウザの `localStorage` です。入力画像そのものは保存しません。

## 主な構成

- `app/page.tsx` — 編集UI、画像入力、プリセット、エクスポート
- `app/engine.ts` — 色分解、網点化、紙・印刷・合成処理
- `app/globals.css` — 印刷ラボ風のUIスタイル
- `tests/rendered-html.test.mjs` — レンダリングのスモークテスト

## 技術スタック

- React 19
- Vinext / Vite
- TypeScript
- Canvas 2D
- Tailwind CSS 4

## 開発上の注意

- 高解像度・多色・分版書き出しはブラウザ上で計算量が大きくなります。処理に時間がかかる場合は、出力サイズまたはインク数を下げてください。
- プリセットはブラウザごとのローカル保存です。別の端末やブラウザには同期されません。
