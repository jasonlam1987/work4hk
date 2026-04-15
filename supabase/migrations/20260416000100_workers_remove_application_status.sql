-- Migration: remove application_status from workers/labours table
-- Note:
-- 1) This repo frontend uses external backend API. Please apply equivalent migration in backend DB.
-- 2) Script is written defensively; if table/column doesn't exist it will be skipped.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'labours'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'labours' AND column_name = 'application_status'
    ) THEN
      ALTER TABLE public.labours DROP COLUMN application_status;
    END IF;
  END IF;
END $$;
