import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { Employer, getEmployers } from '../api/employers';
import { getAuthIdentity, isSuperAdmin } from '../utils/authRole';
import { appendGlobalAuditLog, GlobalAuditLog } from '../utils/auditLog';
import { pushInAppMessage } from '../utils/inAppMessages';
import { pushDeleteNotice } from '../utils/deleteNotifications';

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
  common_jobs: CommonJobRow[];
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
  { key: 'new-jobs', label: '常見職位新申請' },
  { key: 'renew-jobs', label: '常見職位續約' },
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
  common_jobs: [],
});

const emptyCommonJobRow = (): CommonJobRow => ({
  id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  post_code: '',
  post_name: '',
  employment_months: '',
  apply_count_new: '',
  apply_count_renewal: '',
});

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
  const employerBlurTimer = useRef<number | null>(null);
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
        /^\d+$/.test(String(row.apply_count_renewal || '').trim())
      );
    map['common-jobs'] = commonJobsOk;
    return map;
  }, [sectionDone, applicantErrors, form.common_jobs]);

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
    return `${SECTION_LABELS.find((x) => x.key === section)?.label || section}已有內容`;
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedId(null);
    setEmployerQuery('');
    setEmployerDropdownOpen(false);
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
    };
    const draftKey = getDraftStorageKey(row.id);
    const draft = readDraftMap()[draftKey];
    setForm(draft?.form || baseForm);
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
    if (mode === 'final') {
      if (applicantErrors.length > 0) {
        return alert(applicantErrors[0]);
      }
      if (!allSectionsCompleted) {
        const pending = visibleSections.find((s) => !computedSectionDone[s.key]);
        return alert(`請先完成所有板塊再建立申請。尚未完成：${pending?.label || '未命名板塊'}`);
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
              <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as QuotaApplicationCategory }))} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm">
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
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              {savingDraft ? '保存中...' : '保存'}
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
                {isEditing ? '儲存修改' : '建立申請'}
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
