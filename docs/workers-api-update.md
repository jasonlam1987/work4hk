# 勞工資料模組 API 更新說明

## 1. 勞工新增/更新 (`POST /api/labours`, `PATCH /api/labours/:id`)
- `contact_phone`：改由前端將 `區號 + 號碼` 合併後提交，例如 `+85298765432`。
- `application_status`：前端已移除，不再提交。
- `labour_status`：前端使用繁中選項（在職/離職/待處理），提交時映射為後端既有值（`Active`/`Inactive`/`Pending`）以保持兼容。
- `contract_salary`：改為字串提交，避免後端 `body.contract_salary: Input should be a valid string` 錯誤。
- `file_uids`：新增可選欄位，格式如下：

```json
{
  "file_uids": {
    "id_docs": ["uid1", "uid2"],
    "education_docs": ["uid3"],
    "work_docs": []
  }
}
```

## 2. 文件上傳 API (`POST /api/ai/worker-files`)
- Request:

```json
{
  "category": "id_docs",
  "file_name": "passport.pdf",
  "mime_type": "application/pdf",
  "data_url": "data:application/pdf;base64,..."
}
```

- Response:

```json
{
  "uid": "xxxx-xxxx",
  "category": "id_docs",
  "original_name": "passport.pdf",
  "mime_type": "application/pdf",
  "size": 12345
}
```

## 3. 刪除已上傳文件 (`DELETE /api/ai/worker-files`)
- Request:

```json
{
  "uid": "xxxx-xxxx"
}
```

- Response:

```json
{
  "ok": true
}
```
