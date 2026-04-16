# Work4HK 勞務管理系統（前端）

本專案為 Work4HK 勞務管理系統的前端（React + TypeScript + Vite），包含：
- 用戶登入（密碼登入 + 微信登入入口）
- 僱主 / 勞工 / 職位 / 批文管理
- 批文與僱主的「儲存空間」檔案庫（伺服器檔案存儲）
- BR 商業登記證 OCR（前端上傳圖片 → 雲端 function → 騰訊 OCR）

## 本機開發

1) 安裝依賴

```bash
npm install
```

2) 啟動

```bash
npm run dev
```

預設網址：`http://localhost:5176/`

## 檔案存儲路徑

- 基準路徑由 `FILE_STORAGE_ROOT` 控制，預設為：
  - `C:\Users\88513\iCloudDrive\work4hk`
- 一次性遷移舊資料：

```bash
npm run migrate:storage
```

## 雲端（Vercel）

線上測試站：`https://traehealthk094l.vercel.app`

注意：線上環境透過 Vercel rewrites 把 `/api/*` 代理到後端（不包含 `/api/ai/*` 與 `/api/wechat/*`）。

## 重要設定（在瀏覽器內設定）

系統設定 → API 金鑰管理會把設定寫入 `localStorage.system_api_keys`。

### BR OCR（騰訊）
- `tencentSecretId`
- `tencentSecretKey`

### 微信登入（前端入口 + OAuth 換取 openid）
- `wechatAppId`
- `wechatAppSecret`

### 登入前「賬戶存在性」預檢（可選）
- `authPrecheckToken`

若要做到「先判斷賬戶是否存在，再判斷密碼」，需要提供一個可讀取後端 `/api/users` 的 Bearer Token（建議管理員 token）。

## GitHub 上傳（換機開發）

1) 初始化 git（若尚未初始化）

```bash
git init
git add .
git commit -m "init: work4hk"
```

2) 綁定你的 GitHub 倉庫並推送

```bash
git branch -M main
git remote add origin <你的倉庫URL>
git push -u origin main
```

換機開發流程：在新機器 `git clone` 後，`npm install` → `npm run dev`，再到「系統設定 → API 金鑰管理」填入 OCR/微信等金鑰。
