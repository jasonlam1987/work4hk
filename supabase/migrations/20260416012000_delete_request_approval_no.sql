-- Add approval number style field for delete-request auditing / traceability
-- This project currently stores delete requests in JSON store on Supabase Storage.
-- If future migration lands on SQL table, reserve this field and index.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'file_delete_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'file_delete_requests'
        AND column_name = 'approval_no'
    ) THEN
      ALTER TABLE public.file_delete_requests
      ADD COLUMN approval_no text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'file_delete_requests'
        AND indexname = 'idx_file_delete_requests_approval_no'
    ) THEN
      CREATE INDEX idx_file_delete_requests_approval_no
      ON public.file_delete_requests (approval_no);
    END IF;
  END IF;
END $$;
