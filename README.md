# NIGHT HEIST 🚐

夜の住宅街で家に忍び込み、お宝を車に積んで売る、最大5人の協力型3Dゲーム。
（Node.js + WebSocket + Three.js）

## 遊び方
1. 「ルームを作る」→ 表示された4文字のコードを友達に伝える（友達は「ルームに入る」にコードを入力）
2. 家のドアの前で **E長押し** で鍵を開ける → 中のお宝を **E** で持つ
3. 車の近くで **E** → 積み込み。買取所で **E** → 売却＆アップグレード
4. 鍵Lvの高い家ほど高額。ピッキング/バッグ/ブーツを強化して稼ごう

| 操作 | キー |
|---|---|
| 移動 / 走る | WASD / Shift |
| 視点 | マウス |
| 操作 | E |
| メニュー（視野角・感度・音量・セーブ/ロード・部屋を抜ける） | ESC |

- 所持金とアップグレードはルーム全員で共有。
- セーブはブラウザのlocalStorageに保存。ロードすると所持金とアップグレードを復元し、新しい夜から再開します。

## ローカルで動かす
```bash
npm install
npm start      # http://localhost:3000
```

## GitHub にアップロード
```bash
git init && git add . && git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/night-heist.git
git push -u origin main
```

## Render にデプロイ
1. Render で **New → Web Service** → GitHub のリポジトリを選択
   （`render.yaml` があるので **Blueprint** でも可）
2. Build Command: `npm install` / Start Command: `npm start`
3. デプロイ後に発行されるURLを開き、友達に共有。WebSocketは同じURLで自動的に `wss://` になります。

※ 無料プランはしばらく無操作だとスリープします。最初のアクセスは起動に少し時間がかかります。
