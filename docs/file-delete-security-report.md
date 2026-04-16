# 文件刪除安全改造報告（2026-04-16）

## 1. 高風險刪除二次確認
- 三模組（僱主、批文、勞工）統一改為彈窗二次確認。
- 彈窗包含：
  - 紅色警示圖示與「永久刪除警告」
  - 提示語：「檔案一旦刪除將無法復原，請謹慎操作」
  - 檔案名稱、所屬公司、板塊、存檔路徑
- 超級管理員需輸入 `DELETE` 才可啟用「確認永久刪除」。
- 管理員僅可「申請刪除」並填寫理由。

## 2. 後端刪除與審批流程
- 新增端點：
  - `GET /api/ai/csrf`：簽發 CSRF token（cookie + response）
  - `POST /api/ai/files-delete`：超級管理員物理刪除
  - `POST /api/ai/files-delete-request`：管理員提出刪除申請（PENDING）
  - `POST /api/ai/files-delete-review`：超級管理員允許/拒絕
  - `GET /api/ai/files-delete-requests`：審批列表
- 安全檢查：
  - 刪除/審批 API 全使用 `POST`
  - 啟用 CSRF 驗證（`x-csrf-token` vs cookie `csrf_token`）
  - 超級管理員驗證：真正物理刪除端點僅 `SUPER_ADMIN` 類角色可呼叫
- 物理刪除：
  - 刪除主存檔與關聯暫存檔
  - 標記 `records[uid].deleted_at`
- 失敗處理：
  - 回傳 `code` 與 `detail`
  - 寫入 `FILE_DELETE_FAILED` 稽核日誌

## 3. 稽核日誌與保留期
- 日誌內容：
  - 操作人 ID、操作人名稱、時間戳
  - 檔案 UID、原始路徑、IP、User-Agent
  - 事件類型（申請、允許、拒絕、物理刪除、失敗）
- 保留策略：
  - 寫入時自動清理超過 30 天的日誌紀錄

## 4. 審批管理與即時通知
- 新增頁面：`/deletion-approvals`
- 列表格式：  
  `用戶 {user_name} 於 {申請時間} 申請刪除 ...`
- 支援「允許 / 拒絕」與拒絕原因輸入。
- 即時通知：
  - 以 `BroadcastChannel + storage event` 推送刪除申請到線上超管頁面（即時刷新）。

## 5. 測試結果
- Unit：`npm run test:unit` -> 25 passed
  - 新增 `api/ai/files_delete_security.test.ts`
  - 覆蓋：成功、權限不足、重複提交、審批重複處理
- E2E：`npm run test:e2e -- tests/e2e/file-api.spec.ts tests/e2e/login-enter.spec.ts` -> 3 passed
- Type Check：`npm run check` -> passed
