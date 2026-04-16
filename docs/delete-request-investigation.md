# 刪除申請流程調查與修復說明

## 問題重現步驟
1. 管理員 A（非超級管理員）進入任一檔案模組，對自己上傳檔案點擊 `申請刪除`。
2. 首次點擊後彈窗提示成功或重複待審，但列表按鈕仍顯示 `申請刪除`，未即時變成 `待刪`。
3. 同 session 再次點擊，後端回覆 `DUPLICATE_PENDING_REQUEST`，UI 才顯示 `待刪`。
4. 切換超級管理員後進入 `審批管理`，列表可能看不到剛建立的刪除申請。

## 根因定位
- 狀態首發不同步：前端輪詢結果直接覆蓋本地狀態，首次提交後本地 `PENDING` 可能被空結果覆寫。
- 第二次才變正確：第二次請求已命中 `409 DUPLICATE_PENDING_REQUEST`，使用者誤以為第二次才生效，實際第一次已建單。
- 超管看不到申請：
  - 舊流程刪除申請主要寫入本地 index，雲端環境多實例下不可共享，導致申請建立與審批列表讀取不一致。
  - 刪除申請只帶 `uid` 時，Supabase 場景缺本地索引可能出現 `file not found`。

## 修復內容
- 後端改為刪除申請資料可寫入/讀取雲端儲存（Supabase）：
  - 新增 `api/ai/_delete_requests_store.ts`。
  - `files-delete-request.ts` 建單時同步寫入 store。
  - `files-delete-requests.ts` 列表改從 store 聚合。
  - `files-delete-review.ts` 審批時讀寫同一 store，跨實例可見。
- 申請 API 補全字段：
  - 前端請求傳入 `module/owner_id/folder/file_name/object_path/uploader_*`，避免僅靠 `uid` 查找失敗。
- 首次狀態即時同步：
  - 提交成功立即本地置為 `PENDING`。
  - 輪詢回來採「合併更新」而非整體覆蓋，避免首次狀態被沖掉。
- 超管審批列表欄位完善：
  - 申請類型、公司、申請人（姓名+帳號）、申請時間（YYYY/MM/DD）、刪除理由、狀態、操作。
- 審批操作加固：
  - 允許/拒絕雙重確認。
  - 防重複提交（busy id）。
  - 拒絕原因改為選填。

## 請求比對（重點）
- 首次申請 `POST /api/ai/files-delete-request`
  - 修復前：常僅帶 `uid/reason/company_name/section_name`
  - 修復後：增加 `module/owner_id/folder/file_name/object_path/stored_path/uploader_id/uploader_name`
- 審批列表 `GET /api/ai/files-delete-requests`
  - 修復前：依賴本地 index，跨實例可見性不穩
  - 修復後：從雲端 store 聚合，超管可見全部，普通管理員僅見本人申請

## 伺服器日誌樣例（文字）
- `DELETE_REQUEST_CREATED`
- `DUPLICATE_PENDING_REQUEST`
- `REQUEST_APPROVED_AND_FILE_DELETED`
- `REQUEST_REJECTED`

### 測試執行 Log（節錄）
```text
✓ tests/e2e/file-api.spec.ts › delete request flow updates status and deletes physical file on approve
✓ api/ai/files_delete_security.test.ts › rejects request and keeps file record undeleted
```

### 請求結果對比（節錄）
```text
POST /api/ai/files-delete-request (首次)   -> 200 DELETE_REQUEST_CREATED
POST /api/ai/files-delete-request (再次)   -> 409 DUPLICATE_PENDING_REQUEST
GET  /api/ai/files-delete-requests (超管) -> 包含該 uid 的 PENDING 申請
POST /api/ai/files-delete-review APPROVE  -> 200 REQUEST_APPROVED_AND_FILE_DELETED
```

## 驗證結果
- Unit：`npm run test:unit` 通過。
- E2E：`tests/e2e/file-api.spec.ts`
  - 驗證首次申請即 `PENDING`
  - 驗證重複提交回 `409`
  - 驗證超管可見待審申請
  - 驗證批准後實體檔案不可再下載
