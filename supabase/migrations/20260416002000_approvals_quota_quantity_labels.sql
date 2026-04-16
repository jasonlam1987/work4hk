-- 批文管理文案對齊：配額明細 -> 配額數量，筆 -> 個
-- 以 COMMENT 方式更新資料庫欄位描述，避免影響既有資料結構

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='quota_details'
  ) THEN
    COMMENT ON TABLE public.quota_details IS '批文配額數量明細';
    COMMENT ON COLUMN public.quota_details.quota_seq IS '配額數量序號（4位）';
    COMMENT ON COLUMN public.quota_details.work_location IS '配額數量工作地點';
    COMMENT ON COLUMN public.quota_details.job_title IS '配額數量職位名稱';
    COMMENT ON COLUMN public.quota_details.monthly_salary IS '配額數量每月工資';
    COMMENT ON COLUMN public.quota_details.work_hours IS '配額數量工作時間';
    COMMENT ON COLUMN public.quota_details.employment_months IS '配額數量僱用期（月）';
  END IF;
END $$;
