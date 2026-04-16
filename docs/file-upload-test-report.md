# 文件上傳測試報告

日期：2026-04-16

## 單元測試
- `api/ai/_file_store.test.ts`
  - token 生成與驗證
  - 一次性 token 防重放

## E2E / 整合測試
- CI 工作流執行：
  - `npm run check`
  - `npm run test:unit`
  - `npm run test:e2e`

## 測試情境覆蓋
- 正常上傳：三模組共通 API `/api/ai/files`
- 大小超限：前後端都阻擋（10MB）
- 網路異常：前端顯示錯誤 + 提供重試
- 並發上傳：可並行上傳多檔，逐檔顯示進度
- 權限不足下載：下載端點驗證 `x-user-role`
- token 驗證：失效/重放 token 會被拒絕

## 備註
- 「中斷續傳」目前採用失敗後重試策略；如需真正分片續傳，可在下一版引入 chunk upload 協定。
- 生產驗收 50MB 批次建議以 5x10MB 或 10x5MB 進行。
