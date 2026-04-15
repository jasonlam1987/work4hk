# 勞工模組部署手冊

## 1. 前置
- Node.js 18+
- 可寫入環境（Vercel Serverless 會使用 `/tmp/work4hk_worker_uploads`）

## 2. 安裝依賴
```bash
npm install
```

## 3. 資料庫變更
- 執行 migration：
  - `supabase/migrations/20260416000100_workers_remove_application_status.sql`
- 目的：移除 `labours.application_status` 欄位（若存在）。

## 4. 測試
```bash
npm run test:unit
npm run test:e2e
```

## 5. 建置
```bash
npm run check
npm run build
```

## 6. 部署
- 推送 `main` 分支，Vercel 自動部署。
- 確認：
  - `/workers` 可正常開啟新增彈窗
  - 手機區號 + 號碼驗證生效（7-11 位）
  - 僱傭期限以「月」顯示與儲存（例：24個月）
  - 列表操作包含：存檔 / 編輯 / 刪除
  - 存檔空間支援拖曳、批次上傳、進度條、刪除

## 7. 回滾
- 回退到上一個 Git commit 並重新部署。
