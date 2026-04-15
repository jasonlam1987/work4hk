# 批文管理模組 API 異動說明

## 1. 欄位調整
- 保留：
  - `department`（發證部門，固定下拉）
  - `issue_date`（發證日期）
  - `expiry_date`（系統自動計算：`issue_date + 12 個月`）
- 移除：
  - `headcount`（配額數量）
  - `valid_until`（有效期限）
- 新增：
  - `quota_details[]`

## 2. department 規則
- 允許值：`勞工處` / `發展局` / `機管局` / `福利處` / `運輸署`
- 預設值：`勞工處`
- 編輯時切換部門會即時 `PATCH` 並寫版本紀錄。

## 3. quota_details 結構
```json
{
  "quota_details": [
    {
      "quota_seq": "0001",
      "work_location": "香港中環",
      "job_title": "建築工人",
      "monthly_salary": 15000,
      "work_hours": "每週6天，每天8小時",
      "employment_months": 24
    }
  ]
}
```

### 驗證規則
- `quota_seq`：4 位數字，同一批文內不可重複
- `work_location`：必填，<=200
- `job_title`：必填，<=100
- `monthly_salary`：必填整數，>=0
- `work_hours`：必填，<=100
- `employment_months`：必填整數，1~120

## 4. 提醒 API（前端本地實作）
- 日常掃描規則：`expiry_date` 命中 180/90/30（±1天）建立提醒
- 去重鍵：`{approval_id}-{window_days}`
- 支援：
  - `mark read`（標記已讀）
  - `re-remind`（再次提醒）
