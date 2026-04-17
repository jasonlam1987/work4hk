import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { Employer, getEmployers } from '../api/employers';
import { getAuthIdentity, isSuperAdmin } from '../utils/authRole';
import { appendGlobalAuditLog, GlobalAuditLog } from '../utils/auditLog';
import { pushInAppMessage } from '../utils/inAppMessages';
import { pushDeleteNotice } from '../utils/deleteNotifications';
import {
  buildCommonJobOptions,
  CommonJobNewRequest,
  emptyCommonJobNewRequest,
  filterCommonJobOptions,
  sanitizeBasicRtfHtml,
  stripHtmlToText,
  validateCommonJobNewRequest,
  validateScheduleSlot,
  WorkScheduleSlot,
} from '../utils/quotaCommonJobRequest';

const QUOTA_APP_CACHE_KEY = 'quota_application_records_v1';
const QUOTA_APP_DRAFT_KEY = 'quota_application_drafts_v1';
const STATUS_OPTIONS = ['製作文件', '已遞交', '本地招聘', '最終審核', '已批出'] as const;
const CATEGORY_OPTIONS = ['新申請', '續約', '新申請及續約'] as const;
const BUSINESS_MODE_OPTIONS = ['獨資經營', '合夥經營', '有限公司'] as const;
const LICENSE_OPTIONS = ['毋須領有', '須領有'] as const;

type QuotaApplicationStatus = (typeof STATUS_OPTIONS)[number];
type QuotaApplicationCategory = (typeof CATEGORY_OPTIONS)[number];
type QuotaApplicationBusinessMode = (typeof BUSINESS_MODE_OPTIONS)[number];
type QuotaApplicationLicense = (typeof LICENSE_OPTIONS)[number];

type CommonJobRow = {
  id: string;
  post_code: string;
  post_name: string;
  employment_months: string;
  apply_count_new: string;
  apply_count_renewal: string;
};

type RenewJobAdjustment = {
  id: string;
  weekly_working_days: string;
  shift_required: '' | 'NO' | 'YES';
  schedules: WorkScheduleSlot[];
  work_addresses: string[];
};

type QuotaApplicationForm = {
  application_no: string;
  submitted_at: string;
  status: QuotaApplicationStatus;
  category: QuotaApplicationCategory;
  employer_id?: number;
  employer_name_cn: string;
  employer_name_en: string;
  business_mode: QuotaApplicationBusinessMode;
  company_incorporation_number: string;
  business_registration_number: string;
  business_type: string;
  applicant_address_cn: string;
  applicant_address_en: string;
  license_required: QuotaApplicationLicense;
  contact_name: string;
  contact_phone_local: string;
  contact_email: string;
  renew_old_file_no: string;
  renew_quota_serial_no: string;
  renew_job_adjustments: RenewJobAdjustment[];
  appendix2_latest_cutoff_date: string;
  appendix2_fulltime_local_total: string;
  appendix2_same_duty_local_counts: Record<string, string>;
  common_jobs: CommonJobRow[];
  common_job_new_requests: CommonJobNewRequest[];
};

type QuotaApplicationRecord = QuotaApplicationForm & {
  id: string;
  created_at: string;
  updated_at: string;
  section_done?: Partial<Record<SectionKey, boolean>>;
  is_draft?: boolean;
  created_by_id?: string;
  created_by_name?: string;
  created_by_role?: string;
  delete_request?: {
    status: 'pending' | 'approved' | 'rejected';
    reason: string;
    requested_by_id: string;
    requested_by_name: string;
    requested_at: string;
    reviewed_by_id?: string;
    reviewed_by_name?: string;
    reviewed_at?: string;
  };
};

type DraftEntry = {
  form: QuotaApplicationForm;
  section_done?: Partial<Record<SectionKey, boolean>>;
  last_active_section?: SectionKey;
  updated_at: string;
};

type SectionKey =
  | 'applicant'
  | 'common-jobs'
  | 'new-jobs'
  | 'renew-jobs'
  | 'appendix-1'
  | 'appendix-2'
  | 'appendix-3a'
  | 'appendix-3b'
  | 'appendix-4'
  | 'appendix-5'
  | 'appendix-6'
  | 'appendix-7';

const SECTION_LABELS: { key: SectionKey; label: string }[] = [
  { key: 'applicant', label: '申請者資料' },
  { key: 'common-jobs', label: '申請常見職位' },
  { key: 'new-jobs', label: '新申請' },
  { key: 'renew-jobs', label: '續約申請' },
  { key: 'appendix-1', label: '附頁一' },
  { key: 'appendix-2', label: '附頁二' },
  { key: 'appendix-3a', label: '附頁三甲' },
  { key: 'appendix-3b', label: '附頁三乙' },
  { key: 'appendix-4', label: '附頁四' },
  { key: 'appendix-5', label: '附頁五' },
  { key: 'appendix-6', label: '附頁六' },
  { key: 'appendix-7', label: '附頁七' },
];

const initialForm = (): QuotaApplicationForm => ({
  application_no: '',
  submitted_at: '',
  status: '製作文件',
  category: '新申請',
  employer_id: undefined,
  employer_name_cn: '',
  employer_name_en: '',
  business_mode: '獨資經營',
  company_incorporation_number: '',
  business_registration_number: '',
  business_type: '',
  applicant_address_cn: '',
  applicant_address_en: '',
  license_required: '毋須領有',
  contact_name: '',
  contact_phone_local: '',
  contact_email: '',
  renew_old_file_no: '',
  renew_quota_serial_no: '',
  renew_job_adjustments: [emptyRenewJobAdjustment()],
  appendix2_latest_cutoff_date: '',
  appendix2_fulltime_local_total: '',
  appendix2_same_duty_local_counts: {},
  common_jobs: [],
  common_job_new_requests: [],
});

const emptyCommonJobRow = (): CommonJobRow => ({
  id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  post_code: '',
  post_name: '',
  employment_months: '',
  apply_count_new: '',
  apply_count_renewal: '',
});

const emptyRenewJobAdjustment = (): RenewJobAdjustment => ({
  id: `renew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  weekly_working_days: '',
  shift_required: '',
  schedules: [{ start: '', end: '' }],
  work_addresses: [''],
});

const formatDateInputYYYYMMDD = (raw: string) => {
  const digits = String(raw || '').replace(/[^\d]/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
};

const QuotaApplications: React.FC = () => {
  const [records, setRecords] = useState<QuotaApplicationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuotaApplicationStatus>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<QuotaApplicationRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [form, setForm] = useState<QuotaApplicationForm>(initialForm());
  const [activeSection, setActiveSection] = useState<SectionKey>('applicant');
  const [sectionDone, setSectionDone] = useState<Partial<Record<SectionKey, boolean>>>({});
  const [modalNotice, setModalNotice] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [pageNotice, setPageNotice] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [employerQuery, setEmployerQuery] = useState('');
  const [employerDropdownOpen, setEmployerDropdownOpen] = useState(false);
  const [jobSelectorQuery, setJobSelectorQuery] = useState('');
  const [jobSelectorOpen, setJobSelectorOpen] = useState(false);
  const [activeNewJobIndex, setActiveNewJobIndex] = useState(0);
  const [collapsedNewJobKeys, setCollapsedNewJobKeys] = useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const employerBlurTimer = useRef<number | null>(null);
  const jobSelectorBlurTimer = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const pageNoticeTimerRef = useRef<number | null>(null);
  const identity = getAuthIdentity();
  const isCurrentUserSuperAdmin = isSuperAdmin();

  const getDraftStorageKey = (id?: string | null) => (id ? `record:${id}` : 'new');

  const getEmployerLabel = (e: Employer) => `${e.name}`.trim();
  const getEmployerBadgeText = (cn?: string, en?: string) => {
    const c = String(cn || '').trim();
    if (c) return c.slice(0, 1);
    const e = String(en || '').trim();
    return e ? e.slice(0, 1).toUpperCase() : '僱';
  };

  const readRecords = (): QuotaApplicationRecord[] => {
    try {
      const raw = localStorage.getItem(QUOTA_APP_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QuotaApplicationRecord[]) : [];
    } catch {
      return [];
    }
  };

  const writeRecords = (items: QuotaApplicationRecord[]) => {
    localStorage.setItem(QUOTA_APP_CACHE_KEY, JSON.stringify(items));
  };

  const appendLog = (payload: Omit<GlobalAuditLog, 'id' | 'at' | 'actor_id' | 'actor_name' | 'actor_role' | 'module'>) => {
    appendGlobalAuditLog({
      module: 'quota-applications',
      ...payload,
    });
  };

  const readDraftMap = (): Record<string, DraftEntry> => {
    try {
      const raw = localStorage.getItem(QUOTA_APP_DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeDraftMap = (map: Record<string, DraftEntry>) => {
    localStorage.setItem(QUOTA_APP_DRAFT_KEY, JSON.stringify(map));
  };

  const clearDraftByKey = (draftKey: string) => {
    const map = readDraftMap();
    if (!map[draftKey]) return;
    delete map[draftKey];
    writeDraftMap(map);
  };

  const showNotice = (type: 'success' | 'warning', text: string, durationMs = 4000) => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setModalNotice({ type, text });
    noticeTimerRef.current = window.setTimeout(() => setModalNotice(null), durationMs);
  };

  const showPageNotice = (type: 'success' | 'warning', text: string, durationMs = 4000) => {
    if (pageNoticeTimerRef.current) window.clearTimeout(pageNoticeTimerRef.current);
    setPageNotice({ type, text });
    pageNoticeTimerRef.current = window.setTimeout(() => setPageNotice(null), durationMs);
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (pageNoticeTimerRef.current) window.clearTimeout(pageNoticeTimerRef.current);
      if (employerBlurTimer.current) window.clearTimeout(employerBlurTimer.current);
      if (jobSelectorBlurTimer.current) window.clearTimeout(jobSelectorBlurTimer.current);
    };
  }, []);

  const inferAddressFields = (address: string) => {
    const raw = String(address || '').trim();
    if (!raw) return { applicant_address_cn: '', applicant_address_en: '' };
    const hasChinese = /[\u4e00-\u9fff]/.test(raw);
    return hasChinese
      ? { applicant_address_cn: raw, applicant_address_en: '' }
      : { applicant_address_cn: '', applicant_address_en: raw };
  };

  const fillFormByEmployer = (e: Employer) => {
    const address = String(e.mailing_address || e.company_address || '').trim();
    const addressFields = inferAddressFields(address);
    setForm((prev) => ({
      ...prev,
      employer_id: e.id,
      employer_name_cn: String(e.name || '').trim(),
      employer_name_en: String(e.english_name || '').trim(),
      company_incorporation_number: prev.business_mode === '有限公司' ? String(e.company_incorporation_number || '').trim() : '',
      business_registration_number: String(e.business_registration_number || '').trim(),
      business_type: String(e.business_type || '').trim(),
      ...addressFields,
    }));
    setEmployerQuery(getEmployerLabel(e));
    setEmployerDropdownOpen(false);
  };

  useEffect(() => {
    setRecords(readRecords());
    const loginMarkKey = `quota_login_mark_${identity.userId || 'anon'}`;
    if (!sessionStorage.getItem(loginMarkKey)) {
      appendLog({
        action: 'login',
        details: '用戶登入後進入申請配額模塊',
      });
      sessionStorage.setItem(loginMarkKey, '1');
    }
    getEmployers({ limit: 1000 }).then(setEmployers).catch(() => setEmployers([]));
  }, []);

  const filteredEmployers = useMemo(() => {
    const q = employerQuery.trim().toLowerCase();
    const source = q
      ? employers.filter((e) => {
          const hay = `${e.name || ''} ${e.english_name || ''} ${e.business_registration_number || ''} ${e.company_incorporation_number || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : employers;
    return source.slice(0, 8);
  }, [employers, employerQuery]);

  const commonJobOptions = useMemo(() => buildCommonJobOptions(form.common_jobs), [form.common_jobs]);
  const commonJobNewRequests = useMemo(
    () => (Array.isArray(form.common_job_new_requests) ? form.common_job_new_requests : []),
    [form.common_job_new_requests]
  );
  const activeNewJobRequest = useMemo(
    () => commonJobNewRequests[activeNewJobIndex] || null,
    [commonJobNewRequests, activeNewJobIndex]
  );
  const filteredJobOptions = useMemo(
    () => filterCommonJobOptions(commonJobOptions, jobSelectorQuery).slice(0, 50),
    [commonJobOptions, jobSelectorQuery]
  );
  const selectedJobOption = useMemo(
    () => commonJobOptions.find((x) => x.id === activeNewJobRequest?.selected_common_job_id),
    [commonJobOptions, activeNewJobRequest?.selected_common_job_id]
  );
  const newJobErrorsList = useMemo(
    () =>
      commonJobNewRequests.map((row) =>
        validateCommonJobNewRequest(row, submitAttempted ? 'final' : 'draft')
      ),
    [commonJobNewRequests, submitAttempted]
  );
  const newJobErrors = useMemo(
    () => newJobErrorsList[activeNewJobIndex] || {},
    [newJobErrorsList, activeNewJobIndex]
  );
  const hasCrossDayShift = useMemo(
    () => (activeNewJobRequest?.schedules || []).some((slot) => validateScheduleSlot(slot).crossDay),
    [activeNewJobRequest?.schedules]
  );
  const skillTextLength = useMemo(
    () => stripHtmlToText(activeNewJobRequest?.skill_requirement_html || '').length,
    [activeNewJobRequest?.skill_requirement_html]
  );
  const appendix2NamedJobs = useMemo(
    () => form.common_jobs.filter((j) => String(j.post_name || '').trim()),
    [form.common_jobs]
  );
  const appendix2DutySum = useMemo(
    () =>
      appendix2NamedJobs.reduce((sum, job) => {
        const n = Number(String(form.appendix2_same_duty_local_counts?.[job.id] || '').trim() || 0);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [appendix2NamedJobs, form.appendix2_same_duty_local_counts]
  );
  const appendix2LocalTotal = useMemo(
    () => Number(String(form.appendix2_fulltime_local_total || '').trim() || 0),
    [form.appendix2_fulltime_local_total]
  );
  const appendix2Remaining = useMemo(() => appendix2LocalTotal - appendix2DutySum, [appendix2LocalTotal, appendix2DutySum]);
  const appendix2OverLimit = useMemo(
    () => /^\d+$/.test(String(form.appendix2_fulltime_local_total || '').trim()) && appendix2DutySum > appendix2LocalTotal,
    [form.appendix2_fulltime_local_total, appendix2DutySum, appendix2LocalTotal]
  );
  const maxSelectableNewJobs = commonJobOptions.length;
  const canAddMoreNewJobs = commonJobNewRequests.length < maxSelectableNewJobs;

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${row.employer_name_cn || ''} ${row.employer_name_en || ''} ${row.application_no || ''} ${row.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const visibleSections = useMemo(() => {
    const isLimitedCompany = form.business_mode === '有限公司';
    return SECTION_LABELS.filter((x) => !(isLimitedCompany && x.key === 'appendix-1'));
  }, [form.business_mode]);

  const sectionIndex = useMemo(
    () => visibleSections.findIndex((x) => x.key === activeSection),
    [visibleSections, activeSection]
  );
  const hasPrev = sectionIndex > 0;
  const hasNext = sectionIndex >= 0 && sectionIndex < visibleSections.length - 1;
  const prevSectionKey = hasPrev ? visibleSections[sectionIndex - 1]?.key : null;
  const nextSectionKey = hasNext ? visibleSections[sectionIndex + 1]?.key : null;

  useEffect(() => {
    if (activeSection === 'appendix-1' && form.business_mode === '有限公司') {
      setActiveSection('applicant');
    }
  }, [activeSection, form.business_mode]);

  const applicantErrors = useMemo(() => {
    const errs: string[] = [];
    if (!form.employer_name_cn && !form.employer_name_en) errs.push('請先選擇申請者（僱主）');
    if (form.status === '已遞交' && !form.submitted_at) errs.push('狀態為「已遞交」時，必須填寫遞交日期');
    if (!form.contact_name.trim() || !form.contact_phone_local.trim() || !form.contact_email.trim()) {
      errs.push('請完整填寫申請負責人的聯絡資料');
    }
    if (form.contact_phone_local.trim() && !/^[0-9]{7,11}$/.test(form.contact_phone_local.trim())) {
      errs.push('本地電話號碼格式不正確（7-11位數字）');
    }
    if (form.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
      errs.push('電郵格式不正確');
    }
    return errs;
  }, [form]);

  const computedSectionDone = useMemo(() => {
    const map: Partial<Record<SectionKey, boolean>> = { ...sectionDone };
    map.applicant = applicantErrors.length === 0;
    const commonJobsOk =
      form.common_jobs.length > 0 &&
      form.common_jobs.every((row) =>
        String(row.post_code || '').trim() &&
        String(row.post_name || '').trim() &&
        /^\d+$/.test(String(row.employment_months || '').trim()) &&
        /^\d+$/.test(String(row.apply_count_new || '').trim()) &&
        (form.category === '新申請' || /^\d+$/.test(String(row.apply_count_renewal || '').trim()))
      );
    map['common-jobs'] = commonJobsOk;
    map['new-jobs'] =
      commonJobNewRequests.length > 0 &&
      commonJobNewRequests.every((row) => Object.keys(validateCommonJobNewRequest(row, 'final')).length === 0);
    const renewRequired = form.category !== '新申請';
    if (!renewRequired) {
      map['renew-jobs'] = true;
    } else {
      const adjustments = Array.isArray(form.renew_job_adjustments) ? form.renew_job_adjustments : [];
      const renewBasicOk =
        String(form.renew_old_file_no || '').trim() &&
        String(form.renew_quota_serial_no || '').trim();
      const renewAdjustmentsOk =
        adjustments.length > 0 &&
        adjustments.every((row) => {
          const weeklyOk = /^\d+$/.test(String(row.weekly_working_days || '').trim());
          const shiftOk = row.shift_required === 'NO' || row.shift_required === 'YES';
          const schedules = Array.isArray(row.schedules) ? row.schedules : [];
          const scheduleCountOk =
            row.shift_required === 'YES'
              ? schedules.length >= 1 && schedules.length <= 5
              : schedules.length === 1;
          const scheduleValueOk = schedules.every((slot) => validateScheduleSlot(slot).valid);
          const addresses = Array.isArray(row.work_addresses) ? row.work_addresses : [];
          const addressCountOk = addresses.length >= 1 && addresses.length <= 3;
          const addressValueOk = addresses.some((x) => String(x || '').trim());
          return weeklyOk && shiftOk && scheduleCountOk && scheduleValueOk && addressCountOk && addressValueOk;
        });
      map['renew-jobs'] = Boolean(renewBasicOk && renewAdjustmentsOk);
    }
    const dateRaw = String(form.appendix2_latest_cutoff_date || '').trim();
    const dateMatch = dateRaw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    let dateOk = false;
    if (dateMatch) {
      const y = Number(dateMatch[1]);
      const m = Number(dateMatch[2]);
      const d = Number(dateMatch[3]);
      const dt = new Date(y, m - 1, d);
      dateOk = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }
    const localTotalOk = /^\d+$/.test(String(form.appendix2_fulltime_local_total || '').trim());
    const namedJobs = appendix2NamedJobs;
    const sameDutyOk =
      namedJobs.length > 0 &&
      namedJobs.every((j) => /^\d+$/.test(String(form.appendix2_same_duty_local_counts?.[j.id] || '').trim()));
    const totalConstraintOk =
      localTotalOk &&
      sameDutyOk &&
      appendix2DutySum <= Number(String(form.appendix2_fulltime_local_total || '').trim() || 0);
    map['appendix-2'] = dateOk && localTotalOk && sameDutyOk && totalConstraintOk;
    return map;
  }, [sectionDone, applicantErrors, form.common_jobs, commonJobNewRequests, form.category, form.renew_job_adjustments, form.renew_old_file_no, form.renew_quota_serial_no, form.appendix2_latest_cutoff_date, form.appendix2_fulltime_local_total, form.appendix2_same_duty_local_counts, appendix2NamedJobs, appendix2DutySum]);

  const allSectionsCompleted = useMemo(
    () => visibleSections.every((s) => Boolean(computedSectionDone[s.key])),
    [visibleSections, computedSectionDone]
  );

  const summarizeSectionContent = (section: SectionKey) => {
    if (section === 'applicant') {
      return `僱主=${form.employer_name_cn || form.employer_name_en || '-'}，申請編號=${form.application_no || '(未填)'}，狀態=${form.status}`;
    }
    if (section === 'common-jobs') {
      return `職位筆數=${form.common_jobs.length}`;
    }
    if (section === 'renew-jobs') {
      return `舊檔案編號=${form.renew_old_file_no || '-'}，續約職位調整=${form.renew_job_adjustments.length} 筆`;
    }
    if (section === 'appendix-2') {
      const namedJobs = form.common_jobs.filter((j) => String(j.post_name || '').trim());
      return `截止日期=${form.appendix2_latest_cutoff_date || '-'}，本地僱員=${form.appendix2_fulltime_local_total || '-'}，職位=${namedJobs.length} 項`;
    }
    return `${SECTION_LABELS.find((x) => x.key === section)?.label || section}已有內容`;
  };

  const updateActiveNewJobRequest = (updater: (prev: CommonJobNewRequest) => CommonJobNewRequest) => {
    setForm((prev) => {
      const list = Array.isArray(prev.common_job_new_requests) ? [...prev.common_job_new_requests] : [];
      const target = list[activeNewJobIndex] || emptyCommonJobNewRequest();
      list[activeNewJobIndex] = updater(target);
      return {
        ...prev,
        common_job_new_requests: list,
      };
    });
  };

  function getNewJobCardKey(_row: CommonJobNewRequest | null | undefined, idx: number) {
    return `idx-${idx}`;
  }

  const renderActiveNewJobEditor = () => {
    if (!activeNewJobRequest) return null;
    return (
      <>
        <div className="border border-gray-200 rounded-apple-sm p-4 bg-white/40">
          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">職位選擇 *</label>
          <div className="relative">
            <input
              type="text"
              value={selectedJobOption ? selectedJobOption.label : jobSelectorQuery}
              onChange={(e) => {
                setJobSelectorQuery(e.target.value);
                setJobSelectorOpen(true);
                updateActiveNewJobRequest((prev) => ({
                  ...prev,
                  selected_common_job_id: '',
                }));
              }}
              onFocus={() => {
                if (jobSelectorBlurTimer.current) window.clearTimeout(jobSelectorBlurTimer.current);
                setJobSelectorOpen(true);
              }}
              onBlur={() => {
                jobSelectorBlurTimer.current = window.setTimeout(() => setJobSelectorOpen(false), 150);
              }}
              placeholder={commonJobOptions.length === 0 ? '請先在「申請常見職位」新增職位' : '搜尋職位編碼或名稱'}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
              aria-required="true"
              aria-invalid={Boolean(newJobErrors.selected_common_job_id)}
            />
            {jobSelectorOpen && (
              <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                {filteredJobOptions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">沒有可選職位，請先新增常見職位</div>
                ) : (
                  filteredJobOptions
                    .filter((opt) => {
                      const duplicate = commonJobNewRequests.some(
                        (row, idx) => idx !== activeNewJobIndex && row.selected_common_job_id === opt.id
                      );
                      return !duplicate;
                    })
                    .map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onMouseDown={(evt) => evt.preventDefault()}
                        onClick={() => {
                          updateActiveNewJobRequest((prev) => emptyCommonJobNewRequest(opt.id));
                          setJobSelectorQuery(opt.label);
                          setJobSelectorOpen(false);
                          setCollapsedNewJobKeys((prev) => prev.filter((x) => x !== getNewJobCardKey(activeNewJobRequest, activeNewJobIndex)));
                          setSubmitAttempted(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="text-sm font-medium text-gray-900">{opt.post_name || '未命名職位'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{opt.post_code || '-'}</div>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
          {newJobErrors.selected_common_job_id && (
            <p className="text-xs text-red-600 mt-1 ml-1">{newJobErrors.selected_common_job_id}</p>
          )}
        </div>

        <fieldset
          className="border border-gray-200 rounded-apple-sm p-4 bg-white/40 space-y-4"
          disabled={!activeNewJobRequest.selected_common_job_id}
        >
          <legend className="px-1 text-sm font-semibold text-gray-800">工作時間設定</legend>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">輪班需求 *</label>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="shift_required"
                  checked={activeNewJobRequest.shift_required === 'NO'}
                  onChange={() =>
                    updateActiveNewJobRequest((prev) => ({
                      ...prev,
                      shift_required: 'NO',
                      schedules: prev.schedules.slice(0, 1),
                    }))
                  }
                />
                不需要輪班
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="shift_required"
                  checked={activeNewJobRequest.shift_required === 'YES'}
                  onChange={() =>
                    updateActiveNewJobRequest((prev) => ({
                      ...prev,
                      shift_required: 'YES',
                      schedules: prev.schedules.length > 0 ? prev.schedules : [{ start: '', end: '' }],
                    }))
                  }
                />
                需輪班
              </label>
            </div>
            {newJobErrors.shift_required && (
              <p className="text-xs text-red-600 mt-1 ml-1">{newJobErrors.shift_required}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">每日工作時間區間（HH:mm）</div>
            {activeNewJobRequest.schedules.map((slot: WorkScheduleSlot, idx: number) => (
              <div key={`slot-${idx}`} className="flex items-center gap-2">
                <input
                  type="time"
                  value={slot.start}
                  onChange={(e) =>
                    updateActiveNewJobRequest((prev) => ({
                      ...prev,
                      schedules: prev.schedules.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x)),
                    }))
                  }
                  className="px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                />
                <span className="text-gray-500">至</span>
                <input
                  type="time"
                  value={slot.end}
                  onChange={(e) =>
                    updateActiveNewJobRequest((prev) => ({
                      ...prev,
                      schedules: prev.schedules.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x)),
                    }))
                  }
                  className="px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                />
                {activeNewJobRequest.shift_required === 'YES' && (
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveNewJobRequest((prev) => ({
                        ...prev,
                        schedules: prev.schedules.filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                    disabled={activeNewJobRequest.schedules.length <= 1}
                  >
                    刪除
                  </button>
                )}
                {validateScheduleSlot(slot).crossDay && (
                  <span className="text-amber-600 text-xs">跨日班次</span>
                )}
              </div>
            ))}
            {activeNewJobRequest.shift_required === 'YES' && (
              <button
                type="button"
                onClick={() =>
                  updateActiveNewJobRequest((prev) => ({
                    ...prev,
                    schedules: prev.schedules.length >= 5 ? prev.schedules : [...prev.schedules, { start: '', end: '' }],
                  }))
                }
                className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                disabled={activeNewJobRequest.schedules.length >= 5}
              >
                新增時段（最多5組）
              </button>
            )}
            {hasCrossDayShift && (
              <p className="text-xs text-amber-600">系統已判定存在跨日班次，請確認班次安排。</p>
            )}
            {newJobErrors.schedules && <p className="text-xs text-red-600">{newJobErrors.schedules}</p>}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">工作地址（最多 3 項）</div>
            {(Array.isArray(activeNewJobRequest.work_addresses) ? activeNewJobRequest.work_addresses : ['']).map((addr, idx) => (
              <div key={`addr-${idx}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={addr}
                  onChange={(e) =>
                    updateActiveNewJobRequest((prev) => {
                      const list = Array.isArray(prev.work_addresses) ? [...prev.work_addresses] : [''];
                      list[idx] = e.target.value;
                      return { ...prev, work_addresses: list };
                    })
                  }
                  placeholder={`工作地址 ${idx + 1}`}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateActiveNewJobRequest((prev) => {
                      const list = Array.isArray(prev.work_addresses) ? prev.work_addresses : [''];
                      const next = list.filter((_, i) => i !== idx);
                      return { ...prev, work_addresses: next.length ? next : [''] };
                    })
                  }
                  className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                  disabled={(Array.isArray(activeNewJobRequest.work_addresses) ? activeNewJobRequest.work_addresses : ['']).length <= 1}
                >
                  刪除
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateActiveNewJobRequest((prev) => {
                  const list = Array.isArray(prev.work_addresses) ? prev.work_addresses : [''];
                  return list.length >= 3 ? prev : { ...prev, work_addresses: [...list, ''] };
                })
              }
              className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
              disabled={(Array.isArray(activeNewJobRequest.work_addresses) ? activeNewJobRequest.work_addresses : ['']).length >= 3}
            >
              新增地址
            </button>
            {newJobErrors.work_addresses && <p className="text-xs text-red-600">{newJobErrors.work_addresses}</p>}
          </div>
        </fieldset>

        <fieldset
          className="border border-gray-200 rounded-apple-sm p-4 bg-white/40 space-y-4"
          disabled={!activeNewJobRequest.selected_common_job_id}
        >
          <legend className="px-1 text-sm font-semibold text-gray-800">語文與技能要求</legend>

          <div>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">會話</div>
                <div className="overflow-x-auto border border-gray-200 rounded-apple-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600">語言</th>
                        <th className="px-3 py-2 text-left text-gray-600">無需</th>
                        <th className="px-3 py-2 text-left text-gray-600">略懂</th>
                        <th className="px-3 py-2 text-left text-gray-600">一般</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'cantonese', label: '粵語' },
                        { key: 'english', label: '英語' },
                        { key: 'other', label: '其他語言' },
                      ].map((lang) => (
                        <tr key={`spoken-${lang.key}`} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">
                            {lang.key === 'other' ? (
                              <input
                                type="text"
                                value={activeNewJobRequest.language_requirement.other_language_name}
                                onChange={(e) =>
                                  updateActiveNewJobRequest((prev) => ({
                                    ...prev,
                                    language_requirement: {
                                      ...prev.language_requirement,
                                      other_language_name: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="其他語言（例如：普通話）"
                                className="w-full min-w-[180px] px-2 py-1 border border-gray-200 rounded"
                              />
                            ) : (
                              lang.label
                            )}
                          </td>
                          {[
                            { value: 'NONE', label: '無需' },
                            { value: 'LITTLE', label: '略懂' },
                            { value: 'FAIR', label: '一般' },
                          ].map((lv) => (
                            <td key={`${lang.key}-${lv.value}`} className="px-3 py-2">
                              <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                                <input
                                  type="radio"
                                  name={`spoken-${lang.key}`}
                                  checked={(activeNewJobRequest.language_requirement.spoken as any)[lang.key] === lv.value}
                                  onChange={() =>
                                    updateActiveNewJobRequest((prev) => ({
                                      ...prev,
                                      language_requirement: {
                                        ...prev.language_requirement,
                                        spoken: {
                                          ...prev.language_requirement.spoken,
                                          [lang.key]: lv.value as any,
                                        },
                                      },
                                    }))
                                  }
                                />
                                {lv.label}
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {newJobErrors.spoken_requirement && (
                  <p className="text-xs text-red-600 mt-1">{newJobErrors.spoken_requirement}</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">讀寫</div>
                <div className="overflow-x-auto border border-gray-200 rounded-apple-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600">語言</th>
                        <th className="px-3 py-2 text-left text-gray-600">無需</th>
                        <th className="px-3 py-2 text-left text-gray-600">略懂</th>
                        <th className="px-3 py-2 text-left text-gray-600">一般</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'cantonese', label: '粵語' },
                        { key: 'english', label: '英語' },
                        { key: 'other', label: '其他語言' },
                      ].map((lang) => (
                        <tr key={`written-${lang.key}`} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">
                            {lang.key === 'other' ? (
                              <input
                                type="text"
                                value={activeNewJobRequest.language_requirement.other_language_name}
                                onChange={(e) =>
                                  updateActiveNewJobRequest((prev) => ({
                                    ...prev,
                                    language_requirement: {
                                      ...prev.language_requirement,
                                      other_language_name: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="其他語言（例如：普通話）"
                                className="w-full min-w-[180px] px-2 py-1 border border-gray-200 rounded"
                              />
                            ) : (
                              lang.label
                            )}
                          </td>
                          {[
                            { value: 'NONE', label: '無需' },
                            { value: 'LITTLE', label: '略懂' },
                            { value: 'FAIR', label: '一般' },
                          ].map((lv) => (
                            <td key={`${lang.key}-${lv.value}`} className="px-3 py-2">
                              <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                                <input
                                  type="radio"
                                  name={`written-${lang.key}`}
                                  checked={(activeNewJobRequest.language_requirement.written as any)[lang.key] === lv.value}
                                  onChange={() =>
                                    updateActiveNewJobRequest((prev) => ({
                                      ...prev,
                                      language_requirement: {
                                        ...prev.language_requirement,
                                        written: {
                                          ...prev.language_requirement.written,
                                          [lang.key]: lv.value as any,
                                        },
                                      },
                                    }))
                                  }
                                />
                                {lv.label}
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {newJobErrors.written_requirement && (
                  <p className="text-xs text-red-600 mt-1">{newJobErrors.written_requirement}</p>
                )}
              </div>
            </div>
            {(newJobErrors.language_requirement || newJobErrors.other_language) && (
              <p className="text-xs text-red-600 mt-1">{newJobErrors.language_requirement || newJobErrors.other_language}</p>
            )}
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">技能與其他要求</div>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(e) =>
                updateActiveNewJobRequest((prev) => ({
                  ...prev,
                  skill_requirement_html: sanitizeBasicRtfHtml((e.target as HTMLDivElement).innerHTML || ''),
                }))
              }
              dangerouslySetInnerHTML={{ __html: activeNewJobRequest.skill_requirement_html || '' }}
              className="min-h-[120px] w-full px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/30"
              role="textbox"
              aria-label="技能與其他要求"
            />
            <div className="mt-1 text-xs text-gray-500">字數：{skillTextLength}/500</div>
            {newJobErrors.skill_requirement_html && (
              <p className="text-xs text-red-600 mt-1">{newJobErrors.skill_requirement_html}</p>
            )}
          </div>
        </fieldset>
      </>
    );
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedId(null);
    setEmployerQuery('');
    setEmployerDropdownOpen(false);
    setJobSelectorQuery('');
    setJobSelectorOpen(false);
    setActiveNewJobIndex(0);
    setCollapsedNewJobKeys([]);
    setSubmitAttempted(false);
    // New application should start from a clean form.
    // Per-record continuation is handled via list -> edit flow.
    clearDraftByKey(getDraftStorageKey(null));
    setForm(initialForm());
    setSectionDone({});
    setActiveSection('applicant');
    setModalNotice(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row: QuotaApplicationRecord) => {
    setIsEditing(true);
    setSelectedId(row.id);
    setEmployerQuery(String(row.employer_name_cn || row.employer_name_en || '').trim());
    setEmployerDropdownOpen(false);
    setJobSelectorQuery('');
    setJobSelectorOpen(false);
    setActiveNewJobIndex(0);
    setCollapsedNewJobKeys([]);
    setSubmitAttempted(false);
    const baseForm: QuotaApplicationForm = {
      application_no: row.application_no,
      submitted_at: row.submitted_at,
      status: row.status,
      category: row.category,
      employer_id: row.employer_id,
      employer_name_cn: row.employer_name_cn,
      employer_name_en: row.employer_name_en,
      business_mode: row.business_mode,
      company_incorporation_number: row.company_incorporation_number,
      business_registration_number: row.business_registration_number,
      business_type: row.business_type,
      applicant_address_cn: row.applicant_address_cn,
      applicant_address_en: row.applicant_address_en,
      license_required: row.license_required,
      contact_name: row.contact_name,
      contact_phone_local: row.contact_phone_local,
      contact_email: row.contact_email,
      renew_old_file_no: String((row as any).renew_old_file_no || ''),
      renew_quota_serial_no: String((row as any).renew_quota_serial_no || ''),
      renew_job_adjustments: Array.isArray((row as any).renew_job_adjustments)
        ? (row as any).renew_job_adjustments.map((x: any, idx: number) => ({
            id: String(x?.id || `renew-${Date.now()}-${idx}`),
            weekly_working_days: String(x?.weekly_working_days || ''),
            shift_required: x?.shift_required === 'YES' || x?.shift_required === 'NO' ? x.shift_required : '',
            schedules: Array.isArray(x?.schedules)
              ? x.schedules.map((s: any) => ({
                  start: String(s?.start || ''),
                  end: String(s?.end || ''),
                }))
              : [{ start: '', end: '' }],
            work_addresses: Array.isArray(x?.work_addresses)
              ? x.work_addresses.map((addr: any) => String(addr || ''))
              : [''],
          }))
        : [emptyRenewJobAdjustment()],
      appendix2_latest_cutoff_date: String((row as any).appendix2_latest_cutoff_date || ''),
      appendix2_fulltime_local_total: String((row as any).appendix2_fulltime_local_total || ''),
      appendix2_same_duty_local_counts:
        (row as any).appendix2_same_duty_local_counts &&
        typeof (row as any).appendix2_same_duty_local_counts === 'object'
          ? Object.fromEntries(
              Object.entries((row as any).appendix2_same_duty_local_counts).map(([k, v]) => [
                String(k),
                String(v || ''),
              ])
            )
          : {},
      common_jobs: Array.isArray((row as any).common_jobs)
        ? (row as any).common_jobs.map((j: any, idx: number) => ({
            id: String(j?.id || `job-${Date.now()}-${idx}`),
            post_code: String(j?.post_code || ''),
            post_name: String(j?.post_name || ''),
            employment_months: String(j?.employment_months || ''),
            apply_count_new: String(j?.apply_count_new || ''),
            apply_count_renewal: String(j?.apply_count_renewal || ''),
          }))
        : [],
      common_job_new_requests: Array.isArray((row as any).common_job_new_requests)
        ? (row as any).common_job_new_requests
        : (row as any).common_job_new_request
        ? [(row as any).common_job_new_request]
        : [],
    };
    const draftKey = getDraftStorageKey(row.id);
    const draft = readDraftMap()[draftKey];
    const sourceFormRaw = (draft?.form || baseForm) as Partial<QuotaApplicationForm>;
    const sourceForm: QuotaApplicationForm = {
      ...baseForm,
      ...sourceFormRaw,
      renew_job_adjustments: Array.isArray(sourceFormRaw?.renew_job_adjustments)
        ? sourceFormRaw.renew_job_adjustments
        : baseForm.renew_job_adjustments,
      common_job_new_requests: Array.isArray(sourceFormRaw?.common_job_new_requests)
        ? sourceFormRaw.common_job_new_requests
        : baseForm.common_job_new_requests,
    };
    setForm(sourceForm);
    const reqList = Array.isArray(sourceForm.common_job_new_requests) ? sourceForm.common_job_new_requests : [];
    setCollapsedNewJobKeys(reqList.map((req, idx) => getNewJobCardKey(req, idx)));
    setSectionDone(draft?.section_done || row.section_done || {});
    setActiveSection(draft?.last_active_section || 'applicant');
    setModalNotice(null);
    appendLog({
      action: 'edit_continue',
      record_id: row.id,
      record_no: row.application_no,
      details: '打開申請配額，繼續錄入',
    });
    setIsModalOpen(true);
  };

  const handleTerminate = (row: QuotaApplicationRecord) => {
    // Always open a modal first; never delete immediately on icon click.
    setPendingDeleteRow(row);
    setDeleteReason('');
    setIsDeleteModalOpen(true);
  };

  const handleSubmitDeleteRequest = () => {
    if (!pendingDeleteRow) return;
    if (isCurrentUserSuperAdmin) {
      const next = records.filter((it) => it.id !== pendingDeleteRow.id);
      setRecords(next);
      writeRecords(next);
      // Remove related drafts to avoid stale form data reappearing in create flow.
      clearDraftByKey(getDraftStorageKey(pendingDeleteRow.id));
      clearDraftByKey(getDraftStorageKey(null));
      appendLog({
        action: 'delete',
        record_id: pendingDeleteRow.id,
        record_no: pendingDeleteRow.application_no,
        details: `超管刪除申請配額，僱主=${pendingDeleteRow.employer_name_cn || pendingDeleteRow.employer_name_en || '-'}`,
      });
      setIsDeleteModalOpen(false);
      setPendingDeleteRow(null);
      setDeleteReason('');
      showPageNotice('success', '已刪除申請配額記錄');
      return;
    }

    const reason = String(deleteReason || '').trim();
    if (!reason) {
      alert('請填寫刪除原因');
      return;
    }
    const now = new Date().toISOString();
    const next: QuotaApplicationRecord[] = records.map((row) =>
      row.id === pendingDeleteRow.id
        ? {
            ...row,
            delete_request: {
              status: 'pending' as const,
              reason,
              requested_by_id: identity.userId || 'unknown',
              requested_by_name: identity.userName || '未設定',
              requested_at: now,
            },
          }
        : row
    );
    setRecords(next);
    writeRecords(next);
    appendLog({
      action: 'delete_request',
      record_id: pendingDeleteRow.id,
      record_no: pendingDeleteRow.application_no,
      section: activeSection,
      details: `申請刪除，原因=${reason}；內容=${summarizeSectionContent(activeSection)}`,
    });
    pushInAppMessage({
      kind: 'generic',
      title: '新刪除申請待審批',
      content: `申請配額刪除申請：${pendingDeleteRow.employer_name_cn || pendingDeleteRow.employer_name_en || '-'}（原因：${reason}）`,
      recipientRoleKey: 'super_admin',
    });
    pushDeleteNotice({
      at: Date.now(),
      message: '有新的刪除申請待審批',
      uid: pendingDeleteRow.id,
      module: 'quota-applications',
    });
    setIsDeleteModalOpen(false);
    setPendingDeleteRow(null);
    setDeleteReason('');
    showPageNotice('success', '刪除申請已提交，等待超級管理員審批');
  };

  const saveRecord = async (mode: 'draft' | 'final') => {
    const newReqErrorsListForSave = commonJobNewRequests.map((row) =>
      validateCommonJobNewRequest(row, mode === 'draft' ? 'draft' : 'final')
    );
    const firstNewReqError = newReqErrorsListForSave
      .map((row) => Object.values(row).find(Boolean))
      .find(Boolean);
    if (mode === 'final') {
      setSubmitAttempted(true);
      if (applicantErrors.length > 0) {
        return alert(applicantErrors[0]);
      }
      if (commonJobNewRequests.length === 0) {
        return alert('請先新增至少一個「新申請」項目');
      }
      if (firstNewReqError) {
        return alert(firstNewReqError || '請先修正「新申請」欄位錯誤');
      }
      if (!allSectionsCompleted) {
        const pending = visibleSections.find((s) => !computedSectionDone[s.key]);
        return alert(`請先完成所有板塊再建立申請。尚未完成：${pending?.label || '未命名板塊'}`);
      }
      try {
        const resp = await fetch('/api/ai/quota-common-jobs-submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            common_jobs: form.common_jobs,
            common_job_new_requests: commonJobNewRequests.map((row) => ({
              ...row,
              skill_requirement_html: sanitizeBasicRtfHtml(row.skill_requirement_html),
            })),
          }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok || payload?.ok === false) {
          const msg = String(payload?.errors?.[0]?.message || payload?.error || '提交驗證失敗');
          return alert(msg);
        }
      } catch (err: any) {
        return alert(String(err?.message || '提交驗證失敗'));
      }
    }

    const now = new Date().toISOString();
    let currentId = selectedId;

    if (isEditing && currentId) {
      const next = records.map((row) =>
        row.id === currentId
          ? {
              ...row,
              ...form,
              section_done: computedSectionDone,
              is_draft: mode === 'draft',
              updated_at: now,
            }
          : row
      );
      setRecords(next);
      writeRecords(next);
      appendLog({
        action: mode === 'draft' ? 'save_draft' : 'save_final',
        record_id: currentId,
        record_no: form.application_no,
        section: activeSection,
        details: mode === 'draft' ? '保存草稿，繼續錄入' : '完成提交更新',
      });
    } else {
      const newId = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record: QuotaApplicationRecord = {
        id: newId,
        ...form,
        section_done: computedSectionDone,
        is_draft: mode === 'draft',
        created_by_id: identity.userId || 'unknown',
        created_by_name: identity.userName || '未設定',
        created_by_role: identity.roleKey || 'unknown',
        created_at: now,
        updated_at: now,
      };
      const next = [record, ...records];
      setRecords(next);
      writeRecords(next);
      currentId = newId;
      setSelectedId(newId);
      setIsEditing(true);
      appendLog({
        action: 'create',
        record_id: newId,
        record_no: form.application_no,
        details: mode === 'draft'
          ? `創建草稿申請配額，僱主=${form.employer_name_cn || form.employer_name_en || '-'}`
          : `創建申請配額，僱主=${form.employer_name_cn || form.employer_name_en || '-'}`,
      });
    }

    const draftKey = getDraftStorageKey(currentId);

    if (mode === 'draft') {
      const firstDraftRequiredError = newReqErrorsListForSave
        .map((x) => x.selected_common_job_id || x.shift_required)
        .find(Boolean);
      if (firstDraftRequiredError) {
        showNotice('warning', firstDraftRequiredError || '請先完成必填欄位');
        return;
      }
      setSavingDraft(true);
      try {
        const map = readDraftMap();
        map[draftKey] = {
          form,
          section_done: computedSectionDone,
          last_active_section: activeSection,
          updated_at: now,
        };
        writeDraftMap(map);

        try {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 3500);
          await fetch('/api/quota-applications/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftKey,
              activeSection,
              sectionDone: computedSectionDone,
              form,
              updatedAt: now,
            }),
            signal: controller.signal,
          });
          window.clearTimeout(timer);
        } catch {
          // local saved; backend sync can retry later
          showNotice('warning', '已本地保存，網絡異常，稍後將自動同步');
          return;
        }

        appendLog({
          action: 'save_draft',
          record_id: currentId || undefined,
          record_no: form.application_no,
          section: activeSection,
          details: `局部保存板塊：${SECTION_LABELS.find((x) => x.key === activeSection)?.label || activeSection}`,
        });
        showNotice('success', '保存成功，請繼續填寫');
      } finally {
        setSavingDraft(false);
      }
      return;
    }

    clearDraftByKey(draftKey);
    setIsModalOpen(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    void saveRecord('final');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">申請配額</h1>
          <p className="text-gray-500 mt-1">管理配額申請進度與申請者資料</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>新增申請</span>
          </button>
        </div>
      </div>
      {pageNotice && (
        <div
          className={[
            'rounded-apple-sm border px-3 py-2 text-sm',
            pageNotice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-700',
          ].join(' ')}
        >
          {pageNotice.text}
        </div>
      )}

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200/50 bg-white/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="搜尋僱主名稱/申請編號..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | QuotaApplicationStatus)}
            className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-apple-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all text-sm"
          >
            <option value="ALL">全狀態</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">僱主名稱</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">創建者</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請編號</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">遞交日期</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">目前沒有申請配額記錄</td>
                </tr>
              ) : (
                visibleRecords.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-medium">
                          {getEmployerBadgeText(row.employer_name_cn, row.employer_name_en)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {row.employer_name_cn || row.employer_name_en || '-'}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {row.employer_name_en || '-'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.created_by_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.application_no}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.submitted_at || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.delete_request?.status === 'pending' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100">待刪除審批</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">{row.status}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        type="button"
                        onClick={() => handleTerminate(row)}
                        disabled={row.delete_request?.status === 'pending'}
                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors disabled:opacity-50"
                        title={row.delete_request?.status === 'pending' ? '已提交刪除申請' : (isCurrentUserSuperAdmin ? '刪除' : '申請刪除')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleOpenEdit(row)} className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors" title="編輯">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? '編輯申請配額' : '新增申請配額'} className="max-w-3xl">
        <form onSubmit={handleSave} className="space-y-4">
          {modalNotice && (
            <div
              className={[
                'rounded-apple-sm border px-3 py-2 text-sm',
                modalNotice.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700',
              ].join(' ')}
            >
              {modalNotice.text}
            </div>
          )}
          <div className="border border-gray-200 rounded-apple-sm p-2 bg-gray-50/60">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={[
                    "px-3 py-1.5 text-xs border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                    activeSection === section.key
                      ? "text-apple-blue border-apple-blue bg-white"
                      : "text-gray-700 border-transparent bg-white hover:bg-gray-100",
                  ].join(' ')}
                >
                  {computedSectionDone[section.key] ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <span className="w-3.5 h-3.5 inline-block" />
                  )}
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          {activeSection === 'applicant' ? (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請類別 *</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const nextCategory = e.target.value as QuotaApplicationCategory;
                  setForm((prev) => ({
                    ...prev,
                    category: nextCategory,
                    common_jobs:
                      nextCategory === '新申請'
                        ? prev.common_jobs.map((x) => ({ ...x, apply_count_renewal: '' }))
                        : prev.common_jobs,
                  }));
                }}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
              >
                {CATEGORY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請編號</label>
              <input type="text" value={form.application_no} onChange={(e) => setForm((prev) => ({ ...prev, application_no: e.target.value.toUpperCase() }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者名稱（選擇僱主）*</label>
              <div className="relative">
                <input
                  type="text"
                  value={employerQuery}
                  onChange={(e) => {
                    setEmployerQuery(e.target.value);
                    setEmployerDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (employerBlurTimer.current) window.clearTimeout(employerBlurTimer.current);
                    setEmployerDropdownOpen(true);
                  }}
                  onBlur={() => {
                    employerBlurTimer.current = window.setTimeout(() => setEmployerDropdownOpen(false), 150);
                  }}
                  placeholder="輸入僱主名稱或BR編號搜尋..."
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                  required
                />
                {employerDropdownOpen && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden">
                    {filteredEmployers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">找不到符合條件的僱主</div>
                    ) : (
                      filteredEmployers.map((e) => (
                        <button key={e.id} type="button" className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors" onMouseDown={(evt) => evt.preventDefault()} onClick={() => fillFormByEmployer(e)}>
                          <div className="text-sm font-medium text-gray-900">{e.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{e.english_name || ''}{e.english_name && e.business_registration_number ? ' · ' : ''}{e.business_registration_number || ''}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者名稱（中文）</label>
              <input type="text" value={form.employer_name_cn} onChange={(e) => setForm((prev) => ({ ...prev, employer_name_cn: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者名稱（英文）</label>
              <input type="text" value={form.employer_name_en} onChange={(e) => setForm((prev) => ({ ...prev, employer_name_en: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">業務經營模式 *</label>
              <select
                value={form.business_mode}
                onChange={(e) => {
                  const mode = e.target.value as QuotaApplicationBusinessMode;
                  const selectedEmployer = employers.find((x) => x.id === form.employer_id);
                  setForm((prev) => ({
                    ...prev,
                    business_mode: mode,
                    company_incorporation_number: mode === '有限公司' ? String(selectedEmployer?.company_incorporation_number || prev.company_incorporation_number || '').trim() : '',
                  }));
                }}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
              >
                {BUSINESS_MODE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">公司註冊證編號（CI）</label>
              <input type="text" value={form.company_incorporation_number} onChange={(e) => setForm((prev) => ({ ...prev, company_incorporation_number: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">商業登記號碼（BR）</label>
              <input type="text" value={form.business_registration_number} onChange={(e) => setForm((prev) => ({ ...prev, business_registration_number: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">業務性質</label>
              <input type="text" value={form.business_type} onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                遞交日期 {form.status === '已遞交' ? '*' : '(選填)'}
              </label>
              <input type="date" value={form.submitted_at} onChange={(e) => setForm((prev) => ({ ...prev, submitted_at: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">狀態 *</label>
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as QuotaApplicationStatus }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm">
                {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者地址（中文）</label>
              <input type="text" value={form.applicant_address_cn} onChange={(e) => setForm((prev) => ({ ...prev, applicant_address_cn: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者地址（英文）</label>
              <input type="text" value={form.applicant_address_en} onChange={(e) => setForm((prev) => ({ ...prev, applicant_address_en: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合法經營業務所需牌照 *</label>
              <select value={form.license_required} onChange={(e) => setForm((prev) => ({ ...prev, license_required: e.target.value as QuotaApplicationLicense }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm">
                {LICENSE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div className="border border-gray-200 rounded-apple-sm p-4 bg-white/40">
            <div className="text-sm font-semibold text-gray-800 mb-3">申請負責人的聯絡資料</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">姓名 *</label>
                <input type="text" value={form.contact_name} onChange={(e) => setForm((prev) => ({ ...prev, contact_name: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">本地電話號碼 *</label>
                <input type="text" value={form.contact_phone_local} onChange={(e) => setForm((prev) => ({ ...prev, contact_phone_local: e.target.value.replace(/[^\d]/g, '').slice(0, 11) }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" placeholder="7-11位數字" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">電郵 *</label>
                <input type="email" value={form.contact_email} onChange={(e) => setForm((prev) => ({ ...prev, contact_email: e.target.value }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm" required />
              </div>
            </div>
          </div>
            </>
          ) : activeSection === 'common-jobs' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">申請常見職位</div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      common_jobs: [...prev.common_jobs, emptyCommonJobRow()],
                    }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-apple-blue text-white rounded-apple-sm text-sm hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新增職位
                </button>
              </div>
              {form.common_jobs.length === 0 ? (
                <div className="border border-dashed border-gray-300 rounded-apple-sm p-8 bg-white/40 text-center text-sm text-gray-500">
                  尚未新增職位。請點擊「新增職位」開始填寫。
                </div>
              ) : (
                <div className="space-y-3">
                  {form.common_jobs.map((row, idx) => (
                    <div key={row.id} className="border border-gray-200 rounded-apple-sm p-4 bg-white/40">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-800">職位 {idx + 1}</div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              common_jobs: prev.common_jobs.filter((x) => x.id !== row.id),
                            }))
                          }
                          className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors"
                          title="刪除職位"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">職位編碼 *</label>
                          <input
                            type="text"
                            value={row.post_code}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                common_jobs: prev.common_jobs.map((x) =>
                                  x.id === row.id ? { ...x, post_code: e.target.value } : x
                                ),
                              }))
                            }
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">職位名稱 *</label>
                          <input
                            type="text"
                            value={row.post_name}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                common_jobs: prev.common_jobs.map((x) =>
                                  x.id === row.id ? { ...x, post_name: e.target.value } : x
                                ),
                              }))
                            }
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱用期（月）*</label>
                          <input
                            type="text"
                            value={row.employment_months}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                common_jobs: prev.common_jobs.map((x) =>
                                  x.id === row.id ? { ...x, employment_months: e.target.value.replace(/[^\d]/g, '') } : x
                                ),
                              }))
                            }
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請勞工人數（新申請）*</label>
                          <input
                            type="text"
                            value={row.apply_count_new}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                common_jobs: prev.common_jobs.map((x) =>
                                  x.id === row.id ? { ...x, apply_count_new: e.target.value.replace(/[^\d]/g, '') } : x
                                ),
                              }))
                            }
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請勞工人數（續約）*</label>
                          <input
                            type="text"
                            value={row.apply_count_renewal}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                common_jobs: prev.common_jobs.map((x) =>
                                  x.id === row.id ? { ...x, apply_count_renewal: e.target.value.replace(/[^\d]/g, '') } : x
                                ),
                              }))
                            }
                            disabled={form.category === '新申請'}
                            className={[
                              "w-full px-4 py-2 border rounded-apple-sm",
                              form.category === '新申請'
                                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                                : "bg-white border border-gray-200",
                            ].join(' ')}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeSection === 'new-jobs' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  已新增職位申請：{commonJobNewRequests.length} 項
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!canAddMoreNewJobs) return;
                    setForm((prev) => ({
                      ...prev,
                      common_job_new_requests: [...commonJobNewRequests, emptyCommonJobNewRequest()],
                    }));
                    setActiveNewJobIndex(commonJobNewRequests.length);
                    setJobSelectorQuery('');
                    setJobSelectorOpen(false);
                    setSubmitAttempted(false);
                  }}
                  disabled={!canAddMoreNewJobs}
                  className={[
                    "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition-colors",
                    canAddMoreNewJobs
                      ? "border-gray-200 hover:bg-gray-50 text-gray-700"
                      : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed",
                  ].join(' ')}
                >
                  <Plus className="w-4 h-4" />
                  {canAddMoreNewJobs ? '選擇職位' : '職位已選滿'}
                </button>
              </div>

              {commonJobNewRequests.length === 0 ? (
                <div className="border border-dashed border-gray-300 rounded-apple-sm p-6 text-sm text-gray-500 text-center">
                  請先點擊「選擇職位」新增一個職位項目，然後逐項填寫。
                </div>
              ) : (
                <div className="space-y-2">
                  {commonJobNewRequests.map((row, idx) => {
                    const cardKey = getNewJobCardKey(row, idx);
                    const isActive = idx === activeNewJobIndex;
                    const collapsed = collapsedNewJobKeys.includes(cardKey);
                    const option = commonJobOptions.find((opt) => opt.id === row.selected_common_job_id);
                    const errors = newJobErrorsList[idx] || {};
                    const isDone = row.selected_common_job_id && Object.keys(validateCommonJobNewRequest(row, 'final')).length === 0;
                    const shiftSummary =
                      row.shift_required === 'YES' ? '需輪班' : row.shift_required === 'NO' ? '不需輪班' : '未選';
                    const scheduleSummary = (row.schedules || [])
                      .map((slot) => {
                        const s = String(slot?.start || '').trim();
                        const e = String(slot?.end || '').trim();
                        return s && e ? `${s}-${e}` : '';
                      })
                      .filter(Boolean)
                      .join('；');
                    return (
                      <div key={cardKey} className="space-y-2">
                        <div
                          onClick={() => {
                            setActiveNewJobIndex(idx);
                          }}
                          onDoubleClick={() => {
                            setActiveNewJobIndex(idx);
                            setCollapsedNewJobKeys((prev) =>
                              prev.includes(cardKey) ? prev.filter((x) => x !== cardKey) : [...prev, cardKey]
                            );
                          }}
                          className={clsx(
                            "border rounded-apple-sm bg-white/60 cursor-pointer",
                            isActive ? "border-apple-blue ring-1 ring-apple-blue/30" : "border-gray-200"
                          )}
                        >
                          <div className="px-3 py-2 flex items-center justify-between">
                            <div className="text-sm">
                              <span className={clsx("font-medium", isActive ? "text-apple-blue" : "text-gray-900")}>職位 {idx + 1}</span>
                              <span className="ml-2 text-gray-600">{option?.label || '未選擇職位'}</span>
                              <span className={`ml-2 text-xs ${isDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {isDone ? '已完成' : '待填寫'}
                              </span>
                              {isActive && <span className="ml-2 text-xs text-apple-blue">當前編輯</span>}
                              {!isDone && submitAttempted && Object.keys(errors).length > 0 && (
                                <span className="ml-2 text-xs text-red-600">有未完成欄位</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveNewJobIndex(idx);
                                  setCollapsedNewJobKeys((prev) => prev.filter((x) => x !== cardKey));
                                }}
                                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                              >
                                編輯
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const willCollapse = !collapsed;
                                  if (willCollapse) {
                                    setCollapsedNewJobKeys((prev) => (prev.includes(cardKey) ? prev : [...prev, cardKey]));
                                  } else {
                                    setActiveNewJobIndex(idx);
                                    setCollapsedNewJobKeys((prev) => prev.filter((x) => x !== cardKey));
                                  }
                                }}
                                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                              >
                                {collapsed ? '展開' : '縮略'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    common_job_new_requests: prev.common_job_new_requests.filter((_, i) => i !== idx),
                                  }));
                                  setCollapsedNewJobKeys((prev) => prev.filter((x) => x !== cardKey));
                                  setActiveNewJobIndex((prev) => (prev > idx ? prev - 1 : Math.max(0, prev === idx ? idx - 1 : prev)));
                                }}
                                className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
                              >
                                刪除
                              </button>
                            </div>
                          </div>
                          <div className="px-3 pb-2 text-xs text-gray-500">
                            輪班：{shiftSummary}；
                            時段：{scheduleSummary || '未填寫'}
                          </div>
                        </div>
                        {isActive && !collapsed && <div className="space-y-2">{renderActiveNewJobEditor()}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeSection === 'renew-jobs' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">舊檔案編號 *</label>
                  <input
                    type="text"
                    value={form.renew_old_file_no}
                    onChange={(e) => setForm((prev) => ({ ...prev, renew_old_file_no: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                    placeholder="請輸入舊檔案編號"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">是次續約配額序號 *</label>
                  <input
                    type="text"
                    value={form.renew_quota_serial_no}
                    onChange={(e) => setForm((prev) => ({ ...prev, renew_quota_serial_no: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                    placeholder="請輸入是次續約配額序號"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-800">續約調整職位詳情</div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      renew_job_adjustments: [
                        ...(Array.isArray(prev.renew_job_adjustments) ? prev.renew_job_adjustments : [emptyRenewJobAdjustment()]),
                        emptyRenewJobAdjustment(),
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-apple-blue text-white rounded-apple-sm text-sm hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新增調整職位
                </button>
              </div>

              {(Array.isArray(form.renew_job_adjustments) ? form.renew_job_adjustments : []).map((item, idx) => (
                <div key={item.id} className="border border-gray-200 rounded-apple-sm p-4 bg-white/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">調整職位 {idx + 1}</div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          renew_job_adjustments:
                            prev.renew_job_adjustments.length <= 1
                              ? prev.renew_job_adjustments
                              : prev.renew_job_adjustments.filter((x) => x.id !== item.id),
                        }))
                      }
                      className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors disabled:opacity-50"
                      disabled={form.renew_job_adjustments.length <= 1}
                      title="刪除調整職位"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">每週工作日數 *</label>
                    <input
                      type="text"
                      value={item.weekly_working_days}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                            x.id === item.id
                              ? { ...x, weekly_working_days: e.target.value.replace(/[^\d]/g, '').slice(0, 2) }
                              : x
                          ),
                        }))
                      }
                      className="w-full md:w-60 px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                      placeholder="例如：6"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">每天固定/輪班時間 *</label>
                    <div className="flex items-center gap-6 mb-3">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name={`renew-shift-${item.id}`}
                          checked={item.shift_required === 'NO'}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                x.id === item.id
                                  ? { ...x, shift_required: 'NO', schedules: x.schedules.slice(0, 1) }
                                  : x
                              ),
                            }))
                          }
                        />
                        固定時間
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name={`renew-shift-${item.id}`}
                          checked={item.shift_required === 'YES'}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                x.id === item.id
                                  ? { ...x, shift_required: 'YES', schedules: x.schedules.length ? x.schedules : [{ start: '', end: '' }] }
                                  : x
                              ),
                            }))
                          }
                        />
                        輪班時間
                      </label>
                    </div>

                    <div className="space-y-2">
                      {item.schedules.map((slot, sIdx) => (
                        <div key={`${item.id}-slot-${sIdx}`} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        schedules: x.schedules.map((s, i) =>
                                          i === sIdx ? { ...s, start: e.target.value } : s
                                        ),
                                      }
                                    : x
                                ),
                              }))
                            }
                            className="px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                          />
                          <span className="text-gray-500">至</span>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        schedules: x.schedules.map((s, i) =>
                                          i === sIdx ? { ...s, end: e.target.value } : s
                                        ),
                                      }
                                    : x
                                ),
                              }))
                            }
                            className="px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                          />
                          {item.shift_required === 'YES' && (
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                    x.id === item.id
                                      ? { ...x, schedules: x.schedules.filter((_, i) => i !== sIdx) || [{ start: '', end: '' }] }
                                      : x
                                  ),
                                }))
                              }
                              className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                              disabled={item.schedules.length <= 1}
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      ))}
                      {item.shift_required === 'YES' && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      schedules: x.schedules.length >= 5 ? x.schedules : [...x.schedules, { start: '', end: '' }],
                                    }
                                  : x
                              ),
                            }))
                          }
                          className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                          disabled={item.schedules.length >= 5}
                        >
                          新增時段（最多5組）
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">工作地址（最多 3 項）</div>
                    {(Array.isArray(item.work_addresses) ? item.work_addresses : ['']).map((addr, aIdx) => (
                      <div key={`${item.id}-addr-${aIdx}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={addr}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      work_addresses: (Array.isArray(x.work_addresses) ? x.work_addresses : ['']).map((v, i) =>
                                        i === aIdx ? e.target.value : v
                                      ),
                                    }
                                  : x
                              ),
                            }))
                          }
                          placeholder={`工作地址 ${aIdx + 1}`}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-apple-sm bg-white text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      work_addresses: (() => {
                                        const list = Array.isArray(x.work_addresses) ? x.work_addresses : [''];
                                        const next = list.filter((_, i) => i !== aIdx);
                                        return next.length ? next : [''];
                                      })(),
                                    }
                                  : x
                              ),
                            }))
                          }
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                          disabled={(Array.isArray(item.work_addresses) ? item.work_addresses : ['']).length <= 1}
                        >
                          刪除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          renew_job_adjustments: prev.renew_job_adjustments.map((x) =>
                            x.id === item.id
                              ? {
                                  ...x,
                                  work_addresses:
                                    (Array.isArray(x.work_addresses) ? x.work_addresses : ['']).length >= 3
                                      ? (Array.isArray(x.work_addresses) ? x.work_addresses : [''])
                                      : [...(Array.isArray(x.work_addresses) ? x.work_addresses : ['']), ''],
                                }
                              : x
                          ),
                        }))
                      }
                      className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                      disabled={(Array.isArray(item.work_addresses) ? item.work_addresses : ['']).length >= 3}
                    >
                      新增地址
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : activeSection === 'appendix-2' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">資料截止最新日期（YYYY/MM/DD）*</label>
                  <input
                    type="text"
                    value={form.appendix2_latest_cutoff_date}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        appendix2_latest_cutoff_date: formatDateInputYYYYMMDD(e.target.value),
                      }))
                    }
                    inputMode="numeric"
                    placeholder="例如：2026/12/31"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">全職本地僱員總數 *</label>
                  <input
                    type="text"
                    value={form.appendix2_fulltime_local_total}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        appendix2_fulltime_local_total: e.target.value.replace(/[^\d]/g, ''),
                      }))
                    }
                    placeholder="請輸入人數"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                  />
                </div>
              </div>

              <div className="border border-gray-200 rounded-apple-sm p-4 bg-white/40">
                <div className="text-sm font-semibold text-gray-800 mb-3">申請職位</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">職位名稱</th>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">職務與本地僱員相同人數 *</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appendix2NamedJobs.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-3 text-gray-500">
                            尚未在「申請常見職位」新增職位
                          </td>
                        </tr>
                      ) : (
                        appendix2NamedJobs.map((job) => (
                            <tr key={job.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 text-gray-800">{job.post_name}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={form.appendix2_same_duty_local_counts?.[job.id] || ''}
                                  onChange={(e) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      appendix2_same_duty_local_counts: {
                                        ...(prev.appendix2_same_duty_local_counts || {}),
                                        [job.id]: e.target.value.replace(/[^\d]/g, ''),
                                      },
                                    }))
                                  }
                                  placeholder="輸入人數"
                                  className="w-full md:w-52 px-3 py-2 border border-gray-200 rounded-apple-sm bg-white"
                                />
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs">
                  <span className="text-gray-600">
                    目前合計：{appendix2DutySum}，總人數：{/^\d+$/.test(String(form.appendix2_fulltime_local_total || '').trim()) ? appendix2LocalTotal : '-'}，
                    剩餘：{/^\d+$/.test(String(form.appendix2_fulltime_local_total || '').trim()) ? appendix2Remaining : '-'}
                  </span>
                  {appendix2OverLimit && (
                    <p className="text-red-600 mt-1">
                      職位人數合計（{appendix2DutySum}）不可大於全職本地僱員總數（{appendix2LocalTotal}），請修改後再保存/提交。
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-gray-300 rounded-apple-sm p-8 bg-white/40 text-center">
              <div className="text-base font-semibold text-gray-800">
                {visibleSections.find((x) => x.key === activeSection)?.label}
              </div>
              <div className="text-sm text-gray-500 mt-2">
                此板塊導航已完成，等待你提供字段後我會直接補齊錄入表單。
              </div>
              <label className="inline-flex items-center gap-2 mt-4 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(computedSectionDone[activeSection])}
                  onChange={(e) => setSectionDone((prev) => ({ ...prev, [activeSection]: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-apple-blue focus:ring-apple-blue"
                />
                此板塊資料已填妥
              </label>
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors">取消</button>
            <button
              type="button"
              onClick={() => void saveRecord('draft')}
              disabled={savingDraft}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-apple-sm font-medium transition-colors disabled:opacity-60"
            >
              {savingDraft ? '儲存中...' : '儲存草稿'}
            </button>
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => {
                if (prevSectionKey) setActiveSection(prevSectionKey);
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors disabled:opacity-50"
            >
              上一步
            </button>
            {hasNext ? (
              <button
                type="button"
                onClick={() => {
                  if (nextSectionKey) setActiveSection(nextSectionKey);
                }}
                className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors"
              >
                下一步
              </button>
            ) : (
              <button
                type="submit"
                disabled={!allSectionsCompleted}
                className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors disabled:opacity-60"
                title={allSectionsCompleted ? '' : '請先完成所有板塊'}
              >
                {isEditing ? '提交申請' : '提交申請'}
              </button>
            )}
          </div>
        </form>
      </Modal>

      {isDeleteModalOpen && pendingDeleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">http://localhost:5176 顯示</h3>
            <p className="text-gray-200 text-base mb-4 leading-relaxed">
              確定要刪除「{pendingDeleteRow.employer_name_cn || pendingDeleteRow.employer_name_en || '未命名企業'}」的申請嗎？
            </p>
            {!isCurrentUserSuperAdmin && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-200 mb-2">刪除原因 *</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                  rows={4}
                  placeholder="請輸入刪除原因"
                />
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setPendingDeleteRow(null);
                  setDeleteReason('');
                }}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmitDeleteRequest}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-apple-blue text-white hover:bg-blue-600 transition-colors"
              >
                {isCurrentUserSuperAdmin ? '確認' : '提交申請'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuotaApplications;
