# NIGHT HEIST 🚐

夜の住宅街で家に忍び込み、お宝を車に積んで売る、最大5人の協力型3Dゲーム。
（Node.js + WebSocket + Three.js）

## 遊び方
1. 「ルームを作る」→ 4文字のコードを友達に伝える（友達は「ルームに入る」にコードを入力）
2. 全員で大豪邸に忍び込む。ドアの前で **E** → **鍵開けミニゲーム**（回る針が緑の範囲に入った瞬間に Space / クリック。全ピンを止めれば開錠、ミス3回でピックが折れて物音が出る）
3. 部屋のお宝を **E** で盗む → 車で **E** で積み込む → 買取所で売ってアップグレード
4. **警備員**は懐中電灯の光（円錐）の中でこちらを見つけると警戒が溜まり（？→！）、追ってくる。捕まると持っているお宝を落として入口に戻される。**C** でしゃがむと見つかりにくい
5. 奥の部屋ほど鍵Lvが高く高額（金庫室が最高）。屋敷には6部屋・36個のお宝があり、「次の夜へ」で補充

| 操作 | キー |
|---|---|
| 移動 / 走る / しゃがむ | WASD / Shift / C |
| 視点 | マウス |
| 操作・盗む・開錠に挑戦 | E |
| ミニゲームで止める | Space またはクリック |
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
