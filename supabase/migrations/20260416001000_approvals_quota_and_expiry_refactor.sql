-- approvals 模組結構改造
-- 1) 發證部門標準化（可在後端 DTO/enum 層同步）
-- 2) 移除舊欄位：headcount, valid_until
-- 3) 新增 expiry_date
-- 4) 新增 quota_details 子表（permit_id, quota_seq 主鍵）

DO $$
BEGIN
  -- 若存在 approvals 主表，補充 expiry_date
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='approvals'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='approvals' AND column_name='expiry_date'
    ) THEN
      ALTER TABLE public.approvals ADD COLUMN expiry_date date;
    END IF;

    -- 歷史資料清理策略：若 valid_until 存在且 expiry_date 為空，先回填
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='approvals' AND column_name='valid_until'
    ) THEN
      UPDATE public.approvals
      SET expiry_date = COALESCE(expiry_date, valid_until::date)
      WHERE expiry_date IS NULL;
    END IF;

    -- 若 issue_date 有值但 expiry_date 仍空，按 issue_date + 12 個月補值
    UPDATE public.approvals
    SET expiry_date = (issue_date::date + INTERVAL '12 months')::date
    WHERE expiry_date IS NULL AND issue_date IS NOT NULL;
  END IF;
END $$;

-- 建立 quota_details（兼容 permits/approvals 命名）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='quota_details'
  ) THEN
    CREATE TABLE public.quota_details (
      permit_id bigint NOT NULL,
      quota_seq varchar(4) NOT NULL,
      work_location varchar(200) NOT NULL,
      job_title varchar(100) NOT NULL,
      monthly_salary bigint NOT NULL CHECK (monthly_salary >= 0),
      work_hours varchar(100) NOT NULL,
      employment_months integer NOT NULL CHECK (employment_months >= 1 AND employment_months <= 120),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (permit_id, quota_seq)
    );
  END IF;
END $$;

-- FK: 若 approvals 存在則掛 approvals；若 permits 存在則可由後端改為 permits
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='approvals'
  ) THEN
    BEGIN
      ALTER TABLE public.quota_details
      ADD CONSTRAINT fk_quota_details_approvals
      FOREIGN KEY (permit_id) REFERENCES public.approvals(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 移除舊欄位（如存在）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='approvals'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='approvals' AND column_name='headcount'
    ) THEN
      ALTER TABLE public.approvals DROP COLUMN headcount;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='approvals' AND column_name='valid_until'
    ) THEN
      ALTER TABLE public.approvals DROP COLUMN valid_until;
    END IF;
  END IF;
END $$;
