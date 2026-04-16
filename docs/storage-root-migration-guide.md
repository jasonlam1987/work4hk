# 存檔基準路徑遷移指南

## 新基準路徑
- 唯一基準路徑：`C:\Users\88513\iCloudDrive\work4hk`
- 設定來源：環境變數 `FILE_STORAGE_ROOT`（未設定時預設為上述路徑）
- 目錄結構：
  - `data/`：正式存檔
  - `tmp/`：上傳暫存
  - `index.json`：索引與稽核資料
  - `migration-reports/`：遷移報告

## 啟動檢查
- 啟動時會自動：
  - 建立缺失目錄（含上層目錄）
  - 執行讀寫權限探測（寫入/讀取/刪除 probe 檔）
- 權限不足時回報：
  - `STORAGE_PERMISSION_DENIED`
  - 並附修正建議（Windows 安全性 Full Control + iCloud 同步狀態）

## 一次性遷移
1. 執行：
   - `npm run migrate:storage`
2. 腳本會將舊路徑（`os.tmpdir()/work4hk_files`）內容複製到新路徑：
   - 保留原始目錄層級
   - 保留檔案屬性（時間戳與模式）
   - 不移動舊檔（僅複製）
3. 遷移完成後輸出摘要，並在
   - `C:\Users\88513\iCloudDrive\work4hk\migration-reports`
   生成 `migration-*.json`（成功/失敗清單）

## 回滾方案
- 應用層回滾：
  - 將 `FILE_STORAGE_ROOT` 指回舊儲存根（僅在必要時）
  - 重新啟動服務
- 資料回滾：
  - 新路徑資料不會覆蓋舊路徑，故可直接切回舊路徑運行

## 新增存儲功能規範
- 不可在業務碼直接硬編碼存檔根路徑
- 必須透過 `_storage_root.ts` 取得路徑
- 任何寫入前需確保已通過 `ensureStorageReady()`
- 任何讀取需從 `getStoragePaths().root` 所屬目錄讀取
- 遷移/批量複製必須產生報告且不可使用「移動」替代
