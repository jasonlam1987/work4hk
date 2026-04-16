# 方案 B：Vercel + 雲端儲存切換指南

## 目標
- 在 `est-hk.com`（Vercel）環境使用雲端物件儲存，避免依賴本機 `C:\` 路徑。
- 保證不同 IP 使用者上傳都落在同一個 bucket。

## 必填環境變數（Vercel Production）
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`（建議：`work4hk-files`）
- `FILE_TOKEN_SECRET`（建議隨機長字串）

## 行為說明
- 當 `SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY` 存在時：
  - 上傳：寫入 Supabase Storage
  - 下載：由 API 從 Supabase 讀出後回傳
  - 刪除：從 Supabase bucket 實體刪除
- 未設定時才回退本地檔案系統。

## 儲存路徑規則（bucket 內）
- `{module}/{owner_id}/{uid}/{file_name}`
- 例如：`employers/123/9c.../contract.pdf`

## 上線驗證
1. 在 Vercel 設定以上環境變數。
2. 重新部署 `main`。
3. 於 `est-hk.com` 測試三模組上傳/下載。
4. 到 Supabase Storage bucket 確認檔案存在且路徑規則正確。

## 注意
- 方案 B 無法把檔案寫到 `C:\Users\88513\iCloudDrive\work4hk`，因為 Vercel 執行環境非 Windows 主機。
