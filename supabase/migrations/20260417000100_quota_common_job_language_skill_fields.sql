-- 常見職位新申請：語文與技能欄位
-- 若 quota_applications 尚未建立，以下語句會安全跳過

alter table if exists public.quota_applications
  add column if not exists selected_common_job_id text,
  add column if not exists shift_required text,
  add column if not exists work_schedules jsonb not null default '[]'::jsonb,
  add column if not exists language_requirement jsonb not null default '{}'::jsonb,
  add column if not exists skill_requirement_html text,
  add column if not exists skill_requirement_plain text;

comment on column public.quota_applications.selected_common_job_id is '常見職位ID';
comment on column public.quota_applications.shift_required is '是否需輪班: NO|YES';
comment on column public.quota_applications.work_schedules is '工作時間區間列表';
comment on column public.quota_applications.language_requirement is '語文要求（checkbox結構）';
comment on column public.quota_applications.skill_requirement_html is '技能與其他要求（RTF HTML）';
comment on column public.quota_applications.skill_requirement_plain is '技能與其他要求（純文字，用於長度檢查）';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'quota_applications'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'quota_applications'
        and constraint_name = 'chk_quota_applications_shift_required'
    ) then
      alter table public.quota_applications
        add constraint chk_quota_applications_shift_required
        check (shift_required is null or shift_required in ('NO', 'YES'));
    end if;

    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'quota_applications'
        and constraint_name = 'chk_quota_applications_skill_plain_len'
    ) then
      alter table public.quota_applications
        add constraint chk_quota_applications_skill_plain_len
        check (skill_requirement_plain is null or char_length(skill_requirement_plain) <= 500);
    end if;
  end if;
end $$;
