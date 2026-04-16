# 文件上傳 API 規格（僱主/批文/勞工）

## POST `/api/ai/files`
- 用途：上傳文件（先寫入暫存目錄，再移動到正式路徑）
- Request JSON
```json
{
  "module": "employers|approvals|workers",
  "owner_id": 123,
  "folder": "企業資料",
  "file_name": "a.pdf",
  "mime_type": "application/pdf",
  "data_url": "data:application/pdf;base64,..."
}
```
- 前後端大小限制：單檔 <= 10MB，超限回傳
`檔案大小超過 10 MB，請壓縮後再上傳`

- Response JSON
```json
{
  "uid": "uuid",
  "sha256": "...",
  "stored_path": "/tmp/work4hk_files/data/...",
  "download_url": "/api/ai/files-download?uid=...&token=...",
  "token_expires_in": 600
}
```

## GET `/api/ai/files`
- 用途：按模組/擁有者/資料夾查詢檔案
- Query: `module`, `owner_id`, `folder`
- 回傳每筆含一次性 `download_url`

## DELETE `/api/ai/files`
- 用途：刪除文件（邏輯刪除）
- Request JSON: `{ "uid": "..." }`

## GET `/api/ai/files-download`
- 用途：下載原始檔案
- Query: `uid`, `token`
- 安全：
  - 驗證 token 簽章
  - 驗證 token 過期
  - 一次性 token（使用後即失效）
  - 驗證角色 header（`x-user-role`）
- Response header：
  - `Content-Type`
  - `Content-Disposition`
  - `Content-Length`
