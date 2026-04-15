# 勞工資料模組 API 更新說明

## 1. 勞工新增/更新 (`POST /api/labours`, `PATCH /api/labours/:id`)
- `contact_phone`：改由前端將 `區號 + 號碼` 合併後提交，例如 `+85298765432`。
- `application_status`：前端已移除，不再提交。
- `labour_status`：前端使用繁中選項（在職/離職/待處理），提交時映射為後端既有值（`Active`/`Inactive`/`Pending`）以保持兼容。
- `labour_status`：前端改為三種狀態（`辦證中` / `在職` / `離職`），提交時映射為後端既有值（`Pending` / `Active` / `Inactive`）。
- 首次新增：狀態固定為 `辦證中`。
- 編輯時若切為 `在職`：必填 `arrival_date`（赴港日期）。
- 編輯時若切為 `離職`：必填 `departure_date`（離港日期）。
- `contract_salary`：改為字串提交，避免後端 `body.contract_salary: Input should be a valid string` 錯誤。
- `employment_term`：前後端統一以「月」表示，提交格式固定為 `XX個月`（例如 `24個月`）。
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

## 4. 勞工列表操作
- 新增列表操作按鈕：
  - `存檔`：開啟存檔空間
  - `編輯`：開啟編輯表單
  - `刪除`：刪除勞工（`DELETE /api/labours/:id`）
- Dashboard 新增續期提醒：
  - 當勞工為「在職」且存在赴港日期，系統會以僱傭期限（月）計算到期日
  - 到期前 9 個月開始在業務概覽顯示「勞工續期提示（姓名、餘下天數）」
