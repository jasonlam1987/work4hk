import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw, Trash2, FolderOpen, UploadCloud, Download, FileText } from 'lucide-react';
import { Approval, getApprovals, createApproval, updateApproval, deleteApproval, ApprovalCreate, DEPARTMENT_OPTIONS, QuotaDetail, getApprovalQuotaDetails, getApprovalQuotaMap, setApprovalQuotaDetails, appendApprovalVersionLog, countQuotaSlots, expandQuotaSeqRange } from '../api/approvals';
import { Employer, getEmployers } from '../api/employers';
import { Partner, getPartners } from '../api/settings';
import Modal from '../components/Modal';
import clsx from 'clsx';
import { downloadManagedFile, listManagedFiles, MAX_UPLOAD_SIZE, uploadManagedFile } from '../api/files';
import { normalizeErrorMessage } from '../utils/errorMessage';
import { useUploadStore } from '../store/uploadStore';
import { DeleteContext, listDeleteRequests, permanentDeleteFile, requestDeleteFile } from '../api/fileDeletion';
import { getAuthIdentity, isSuperAdmin } from '../utils/authRole';
import FileDeleteActionDialog from '../components/FileDeleteActionDialog';
import { pushDeleteNotice } from '../utils/deleteNotifications';
import { pushInAppMessage } from '../utils/inAppMessages';
import { markDeletePending, releaseDeletePending } from '../utils/deletePendingState';
import { submitEntityDeleteRequest } from '../utils/entityDeleteRequests';
import { resolveApprovalEmployerId } from '../utils/approvalEmployer';

interface StoredApprovalFile {
  id: string;
  uid: string;
  approvalId: number;
  folder: string;
  name: string;
  size: number;
  mimeType?: string;
  downloadUrl?: string;
  storedPath?: string;
  objectPath?: string;
  uploaderId?: string;
  uploaderName?: string;
  uploadTime: string;
}

type QuotaDetailForm = {
  quota_seq_start: string;
  quota_seq_end: string;
  work_location_1: string;
  work_location_2: string;
  work_location_3: string;
  job_title: string;
  monthly_salary: string;
  work_hours: string;
  employment_months: string;
  import_group?: string;
  _deleted?: boolean;
};

const APPROVAL_FOLDERS = ['批文文件', '申請文件', '其他'];
const QUOTA_APP_CACHE_KEY = 'quota_application_records_v1';
const QUOTA_APP_STATUS_OPTIONS = ['製作文件', '已遞交', '本地招聘', '最終審核', '已批出'] as const;
const QUOTA_APP_CATEGORY_OPTIONS = ['新申請', '續約', '新申請及續約'] as const;
const QUOTA_APP_BUSINESS_MODE_OPTIONS = ['獨資經營', '合夥經營', '有限公司'] as const;
const QUOTA_APP_LICENSE_OPTIONS = ['毋須領有', '須領有'] as const;

type QuotaApplicationStatus = (typeof QUOTA_APP_STATUS_OPTIONS)[number];
type QuotaApplicationCategory = (typeof QUOTA_APP_CATEGORY_OPTIONS)[number];
type QuotaApplicationBusinessMode = (typeof QUOTA_APP_BUSINESS_MODE_OPTIONS)[number];
type QuotaApplicationLicense = (typeof QUOTA_APP_LICENSE_OPTIONS)[number];

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
};

type QuotaApplicationRecord = QuotaApplicationForm & {
  id: string;
  created_at: string;
  updated_at: string;
  common_jobs?: Array<{
    id: string;
    post_name?: string;
    employment_months?: string;
    apply_count_new?: string;
    apply_count_renewal?: string;
  }>;
  common_job_new_requests?: Array<{
    selected_common_job_id?: string;
    schedules?: Array<{ start?: string; end?: string }>;
    work_addresses?: string[];
  }>;
};

const initialForm: ApprovalCreate = {
  employer_id: undefined,
  partner_id: undefined,
  approval_number: '',
  department: '勞工處',
  signatory_name: ''
};

const initialQuotaApplicationForm = (): QuotaApplicationForm => ({
  application_no: '',
  submitted_at: new Date().toISOString().slice(0, 10),
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
});

const emptyQuotaRow = (): QuotaDetailForm => ({
  quota_seq_start: '',
  quota_seq_end: '',
  work_location_1: '',
  work_location_2: '',
  work_location_3: '',
  job_title: '',
  monthly_salary: '',
  work_hours: '',
  employment_months: '',
});

const normalizeSeq4 = (v: string) => String(v || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);

const scheduleText = (slots?: Array<{ start?: string; end?: string }>) =>
  (Array.isArray(slots) ? slots : [])
    .map((s) => {
      const start = String(s?.start || '').trim();
      const end = String(s?.end || '').trim();
      return start && end ? `${start}-${end}` : '';
    })
    .filter(Boolean)
    .join('；');

const deriveAppliedCount = (row: any, category: string) => {
  const newCount = Number(String(row?.apply_count_new || '').replace(/[^\d]/g, '') || 0);
  const renewCount = Number(String(row?.apply_count_renewal || '').replace(/[^\d]/g, '') || 0);
  if (category === '新申請') return newCount;
  if (category === '續約') return renewCount;
  return newCount + renewCount;
};

const APPROVALS_CACHE_KEY = 'cache_approvals_list_v1';
const APPROVALS_PERF_KEY = 'approvals_perf_metrics_v1';
const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [quotaSearch, setQuotaSearch] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [quotaMapVersion, setQuotaMapVersion] = useState(0);
  const [quotaApplications, setQuotaApplications] = useState<QuotaApplicationRecord[]>([]);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [isQuotaEditing, setIsQuotaEditing] = useState(false);
  const [selectedQuotaApplicationId, setSelectedQuotaApplicationId] = useState<string | null>(null);
  const [quotaForm, setQuotaForm] = useState<QuotaApplicationForm>(initialQuotaApplicationForm());
  const [quotaEmployerQuery, setQuotaEmployerQuery] = useState('');
  const [quotaEmployerDropdownOpen, setQuotaEmployerDropdownOpen] = useState(false);
  const quotaEmployerBlurTimer = useRef<number | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ApprovalCreate>(initialForm);
  const [saving, setSaving] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState<QuotaDetailForm[]>([]);
  const [quotaDeleteTarget, setQuotaDeleteTarget] = useState<number | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; approvalNumber: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedApprovalForFiles, setSelectedApprovalForFiles] = useState<Approval | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>(APPROVAL_FOLDERS[0]);
  const [storedFiles, setStoredFiles] = useState<StoredApprovalFile[]>([]);
  const fileFolderCacheRef = useRef<Record<string, StoredApprovalFile[]>>({});
  const optimisticPendingUntilRef = useRef<Record<string, number>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteContext, setDeleteContext] = useState<DeleteContext | null>(null);
  const [deleteStatusByUid, setDeleteStatusByUid] = useState<Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'>>({});
  const superAdmin = isSuperAdmin();
  const authIdentity = getAuthIdentity();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadScope = `approvals:${selectedApprovalForFiles?.id || 0}:${activeFolder}`;
  const tasksByScope = useUploadStore(s => s.tasksByScope);
  const beginTask = useUploadStore(s => s.beginTask);
  const updateTask = useUploadStore(s => s.updateTask);
  const failTask = useUploadStore(s => s.failTask);
  const succeedTask = useUploadStore(s => s.succeedTask);
  const clearScope = useUploadStore(s => s.clearScope);
  const uploadTasks = useMemo(() => Object.values(tasksByScope[uploadScope] || {}), [tasksByScope, uploadScope]);
  const quotaMap = useMemo(() => getApprovalQuotaMap(), [quotaMapVersion]);

  const [employers, setEmployers] = useState<Employer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [employerQuery, setEmployerQuery] = useState('');
  const [quotaImportId, setQuotaImportId] = useState('');
  const [partnerQuery, setPartnerQuery] = useState('');
  const [employerDropdownOpen, setEmployerDropdownOpen] = useState(false);
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const employerBlurTimer = useRef<number | null>(null);
  const partnerBlurTimer = useRef<number | null>(null);

  const filteredEmployers = useMemo(() => {
    const q = employerQuery.trim().toLowerCase();
    const raw = q
      ? employers.filter(e => {
          const hay = `${e.code || ''} ${e.name || ''} ${e.english_name || ''} ${e.business_registration_number || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : employers;

    const seen = new Set<string>();
    const list: Employer[] = [];
    for (const e of raw) {
      const key = `${String(e.business_registration_number || '').trim()}|${String(e.code || '').trim()}|${String(e.name || '').trim()}|${String(e.english_name || '').trim()}`
        .trim()
        .toLowerCase();
      const finalKey = key && key !== '|||'
        ? key
        : `id:${String((e as any).id ?? '')}`;
      if (seen.has(finalKey)) continue;
      seen.add(finalKey);
      list.push(e);
    }

    return list.slice(0, 8);
  }, [employers, employerQuery]);

  const filteredPartners = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    const list = q
      ? partners.filter(p => `${p.name || ''}`.toLowerCase().includes(q))
      : partners;
    return list.slice(0, 8);
  }, [partners, partnerQuery]);

  const getEmployerLabel = (e: Employer) => `${e.name}`.trim();

  const getEmployerDisplayById = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of employers) {
      map.set(e.id, getEmployerLabel(e));
    }
    return (id: any, fallback?: string) => {
      const key = Number(id);
      return map.get(key) || fallback || `#${String(id)}`;
    };
  }, [employers]);

  const getPartnerDisplayById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of partners) {
      map.set(p.id, p.name);
    }
    return (id: any, fallback?: string) => {
      const key = Number(id);
      return map.get(key) || fallback || `#${String(id)}`;
    };
  }, [partners]);

  const formatDateDisplay = (value?: any) => {
    if (!value) return '-';
    let v = String(value).trim();
    if (!v) return '-';
    if (v.includes('T')) v = v.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace(/-/g, '/');
    return v;
  };

  const readQuotaApplications = (): QuotaApplicationRecord[] => {
    try {
      const raw = localStorage.getItem(QUOTA_APP_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QuotaApplicationRecord[]) : [];
    } catch {
      return [];
    }
  };

  const writeQuotaApplications = (items: QuotaApplicationRecord[]) => {
    localStorage.setItem(QUOTA_APP_CACHE_KEY, JSON.stringify(items));
  };

  const makeQuotaApplicationNoByDate = (items: QuotaApplicationRecord[]) => {
    const now = new Date();
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const regex = new RegExp(`^QA-${day}-(\\d{4})$`);
    let maxSeq = 0;
    for (const row of items) {
      const match = String(row.application_no || '').toUpperCase().match(regex);
      if (!match) continue;
      const n = Number(match[1] || '0');
      if (n > maxSeq) maxSeq = n;
    }
    return `QA-${day}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const inferAddressFields = (address: string) => {
    const raw = String(address || '').trim();
    if (!raw) return { applicant_address_cn: '', applicant_address_en: '' };
    const hasChinese = /[\u4e00-\u9fff]/.test(raw);
    return hasChinese
      ? { applicant_address_cn: raw, applicant_address_en: '' }
      : { applicant_address_cn: '', applicant_address_en: raw };
  };

  const fillQuotaFormByEmployer = (e: Employer) => {
    const businessMode = String(quotaForm.business_mode || '獨資經營') as QuotaApplicationBusinessMode;
    const resolvedMode: QuotaApplicationBusinessMode = QUOTA_APP_BUSINESS_MODE_OPTIONS.includes(businessMode) ? businessMode : '獨資經營';
    const address = String(e.mailing_address || e.company_address || '').trim();
    const addressFields = inferAddressFields(address);
    setQuotaForm((prev) => ({
      ...prev,
      employer_id: e.id,
      employer_name_cn: String(e.name || '').trim(),
      employer_name_en: String(e.english_name || '').trim(),
      business_mode: resolvedMode,
      company_incorporation_number: resolvedMode === '有限公司' ? String(e.company_incorporation_number || '').trim() : '',
      business_registration_number: String(e.business_registration_number || '').trim(),
      business_type: String(e.business_type || '').trim(),
      ...addressFields,
    }));
    setQuotaEmployerQuery(getEmployerLabel(e));
    setQuotaEmployerDropdownOpen(false);
  };

  const refreshPartners = async () => {
    const partnersData = await getPartners().catch(() => [] as Partner[]);
    setPartners(partnersData);
    return partnersData;
  };

  const ensureLookupsLoaded = async () => {
    if (employers.length > 0 && partners.length > 0) return;
    const [employersData, partnersData] = await Promise.all([
      employers.length > 0 ? Promise.resolve(employers) : getEmployers({ limit: 1000 }).catch(() => [] as Employer[]),
      partners.length > 0 ? Promise.resolve(partners) : getPartners().catch(() => [] as Partner[]),
    ]);
    setEmployers(employersData);
    setPartners(partnersData);
  };

  useEffect(() => {
    const raw = localStorage.getItem('mock_approval_files');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setStoredFiles(parsed as StoredApprovalFile[]);
        }
      } catch {
      }
    }
  }, []);

  const mapManagedFiles = (ownerId: number, items: any[]): StoredApprovalFile[] =>
    items.map((it) => ({
      id: it.uid,
      uid: it.uid,
      approvalId: ownerId,
      folder: it.folder,
      name: it.original_name,
      size: it.size,
      mimeType: it.mime_type,
      downloadUrl: it.download_url,
      storedPath: (it as any).stored_path,
      objectPath: (it as any).object_path,
      uploaderId: (it as any).uploader_id,
      uploaderName: (it as any).uploader_name,
      uploadTime: it.created_at ? new Date(it.created_at).toLocaleString() : new Date().toLocaleString(),
    }));

  const folderCacheKey = (ownerId: number, folder: string) => `approvals:${ownerId}:${folder}`;

  const loadFolderFiles = async (ownerId: number, folder: string, preferCache: boolean) => {
    const cacheKey = folderCacheKey(ownerId, folder);
    const cached = fileFolderCacheRef.current[cacheKey];
    if (preferCache && cached) {
      setStoredFiles(cached);
    }
    try {
      const items = await listManagedFiles('approvals', ownerId, folder);
      const mapped = mapManagedFiles(ownerId, items);
      fileFolderCacheRef.current[cacheKey] = mapped;
      setStoredFiles(mapped);
    } catch {
    }
  };

  useEffect(() => {
    if (!isFileModalOpen || !selectedApprovalForFiles) return;
    loadFolderFiles(selectedApprovalForFiles.id, activeFolder, true);
  }, [isFileModalOpen, selectedApprovalForFiles, activeFolder]);

  useEffect(() => {
    if (!isFileModalOpen || !selectedApprovalForFiles || superAdmin) return;
    let canceled = false;
    const loadDeleteStatuses = async () => {
      try {
        const rows = await listDeleteRequests();
        if (canceled) return;
        const next: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'> = {};
        for (const row of rows) {
          if (String(row.module) !== 'approvals') continue;
          if (Number(row.owner_id || 0) !== Number(selectedApprovalForFiles.id)) continue;
          if (!next[row.uid]) next[row.uid] = row.status;
          if (row.status === 'REJECTED') releaseDeletePending(row.uid);
          if (row.status === 'APPROVED') releaseDeletePending(row.uid);
        }
        const now = Date.now();
        for (const [uid, until] of Object.entries(optimisticPendingUntilRef.current)) {
          if (next[uid]) {
            delete optimisticPendingUntilRef.current[uid];
            continue;
          }
          if (until > now) next[uid] = 'PENDING';
          else delete optimisticPendingUntilRef.current[uid];
        }
        setDeleteStatusByUid(next);
      } catch {
      }
    };
    loadDeleteStatuses();
    const timer = window.setInterval(loadDeleteStatuses, 8000);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [isFileModalOpen, selectedApprovalForFiles, superAdmin]);

  useEffect(() => {
    const raw = localStorage.getItem(APPROVALS_CACHE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.items) ? (parsed.items as Approval[]) : Array.isArray(parsed) ? (parsed as Approval[]) : [];
      if (items.length > 0) {
        setApprovals(items);
        setHasLoaded(true);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    setQuotaApplications(readQuotaApplications());
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, []);

  const toApiDate = (value: string) => {
    const v = value.trim();
    if (!v) return null as any;
    const normalized = v.replace(/\//g, '-');
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return `${normalized}T00:00:00.000Z`;
    }
    return normalized;
  };

  const toDateInput = (value: string) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (v.includes('T')) return v.split('T')[0];
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v.replace(/\//g, '-');
    return v;
  };

  const calcExpiryDate = (issue: string) => {
    const base = toDateInput(issue);
    if (!base) return '';
    const d = new Date(base);
    if (Number.isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().slice(0, 10);
  };

  const formatSalary = (raw: string) => {
    const n = Number(String(raw || '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(n)) return '';
    return String(n);
  };

  const prettySalary = (raw: string) => {
    const n = Number(formatSalary(raw));
    if (!Number.isFinite(n)) return '';
    return new Intl.NumberFormat('zh-HK').format(n);
  };

  const formatApiError = (err: any) => {
    const status = err?.response?.status as number | undefined;
    const data = err?.response?.data;

    const detail = data?.detail;
    if (typeof detail === 'string') {
      return status ? `HTTP ${status}：${detail}` : detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const loc = Array.isArray(first?.loc) ? first.loc.join('.') : '';
      const msg = first?.msg ? String(first.msg) : '';
      const text = [loc, msg].filter(Boolean).join('：') || JSON.stringify(detail);
      return status ? `HTTP ${status}：${text}` : text;
    }

    if (data?.message) {
      return status ? `HTTP ${status}：${String(data.message)}` : String(data.message);
    }

    if (err?.message) {
      return status ? `HTTP ${status}：${String(err.message)}` : String(err.message);
    }

    if (data) {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      return status ? `HTTP ${status}：${text}` : text;
    }

    return status ? `HTTP ${status}` : '操作失敗';
  };

  const guessFriendly500 = (err: any) => {
    const status = err?.response?.status as number | undefined;
    if (status !== 500) return null;
    const raw = err?.response?.data;
    const text = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';
    const lower = text.toLowerCase();
    if (lower.includes('duplicate') || lower.includes('unique')) {
      return '批文編號可能已存在，請更換批文編號後再試。';
    }
    if (lower.includes('date') || lower.includes('format')) {
      return '日期格式可能不符合後端要求，請確認日期後再試。';
    }
    return null;
  };

  const fetchApprovals = async () => {
    const startedAt = performance.now();
    try {
      setLoading(true);
      const data = await getApprovals({ limit: 500 });
      setApprovals(data);
      localStorage.setItem(APPROVALS_CACHE_KEY, JSON.stringify({ items: data, savedAt: Date.now() }));
      sessionStorage.setItem(APPROVALS_PERF_KEY, JSON.stringify({ loadMs: Number((performance.now() - startedAt).toFixed(1)), size: data.length, savedAt: Date.now() }));
      setError('');
      setHasLoaded(true);
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const data = err?.response?.data;

      if (status === 500) {
        try {
          const raw = localStorage.getItem(APPROVALS_CACHE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          const items = Array.isArray(parsed?.items)
            ? (parsed.items as Approval[])
            : Array.isArray(parsed)
              ? (parsed as Approval[])
              : [];

          if (items.length > 0) {
            setApprovals(items);
            setHasLoaded(true);
            setError('後端批文服務暫時不可用，已顯示本機快取資料；請稍後再刷新。');
            return;
          }
        } catch {
        }
      }

      const buildDetail = () => {
        const detail = data?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail) && detail.length > 0) {
          const first = detail[0];
          if (first?.msg) return first.msg;
        }
        if (typeof data === 'string') return data;
        if (data) return JSON.stringify(data);
        return '';
      };

      const detailText = buildDetail();
      if (err?.code === 'ECONNABORTED') {
        setError('獲取批文列表逾時，請稍後再試或先使用搜尋縮小範圍');
      } else if (status) {
        const short = detailText ? detailText.slice(0, 200) : '';
        setError(`獲取批文列表失敗 (HTTP ${status})${short ? `：${short}` : ''}`);
      } else {
        setError(`獲取批文列表失敗${err?.message ? `：${String(err.message).slice(0, 200)}` : ''}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const writeApprovalsCache = (items: Approval[]) => {
    localStorage.setItem(APPROVALS_CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
  };

  const visibleApprovals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approvals;
    return approvals.filter(a => {
      const employerId = resolveApprovalEmployerId(a);
      const employerName = getEmployerDisplayById(employerId, a.employer_name);
      const hay = `${String(a.approval_number || '')} ${String(a.department || '')} ${String(employerName || '')} ${String(a.signatory_name || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [approvals, search, getEmployerDisplayById]);

  const filteredQuotaEmployers = useMemo(() => {
    const q = quotaEmployerQuery.trim().toLowerCase();
    const source = q
      ? employers.filter((e) => {
          const hay = `${e.name || ''} ${e.english_name || ''} ${e.business_registration_number || ''} ${e.company_incorporation_number || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : employers;
    return source.slice(0, 8);
  }, [employers, quotaEmployerQuery]);

  const visibleQuotaApplications = useMemo(() => {
    const q = quotaSearch.trim().toLowerCase();
    if (!q) return quotaApplications;
    return quotaApplications.filter((row) => {
      const hay = `${row.employer_name_cn || ''} ${row.employer_name_en || ''} ${row.application_no || ''} ${row.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [quotaApplications, quotaSearch]);

  const importableQuotaApplications = useMemo(() => {
    const employerId = Number(formData.employer_id || 0);
    if (!employerId) return [] as QuotaApplicationRecord[];
    return quotaApplications.filter((row) => {
      const sameEmployer = Number(row.employer_id || 0) === employerId;
      const approved = String(row.status || '') === '已批出';
      return sameEmployer && approved;
    });
  }, [quotaApplications, formData.employer_id]);

  const buildQuotaRowsFromApplication = (app: QuotaApplicationRecord): QuotaDetailForm[] => {
    const jobs = Array.isArray(app.common_jobs) ? app.common_jobs : [];
    const requests = Array.isArray(app.common_job_new_requests) ? app.common_job_new_requests : [];
    const requestMap = new Map<string, { schedules?: Array<{ start?: string; end?: string }>; work_addresses?: string[] }>();
    for (const req of requests) {
      const jobId = String(req?.selected_common_job_id || '').trim();
      if (!jobId) continue;
      requestMap.set(jobId, {
        schedules: Array.isArray(req?.schedules) ? req!.schedules : [],
        work_addresses: Array.isArray(req?.work_addresses) ? req!.work_addresses : [],
      });
    }

    const rows: QuotaDetailForm[] = [];
    let seq = 1;
    for (const job of jobs) {
      const count = deriveAppliedCount(job, String(app.category || '新申請'));
      if (!Number.isFinite(count) || count <= 0) continue;
      const jobId = String(job?.id || '').trim();
      const req = jobId ? requestMap.get(jobId) : undefined;
      const location1 = String(req?.work_addresses?.[0] || '').trim();
      const location2 = String(req?.work_addresses?.[1] || '').trim();
      const location3 = String(req?.work_addresses?.[2] || '').trim();
      const hours = scheduleText(req?.schedules);
      const months = String(job?.employment_months || '').replace(/[^\d]/g, '');
      const title = String(job?.post_name || '').trim();
      for (let i = 0; i < count; i += 1) {
        rows.push({
          quota_seq_start: normalizeSeq4(String(seq)),
          quota_seq_end: normalizeSeq4(String(seq)),
          work_location_1: location1,
          work_location_2: location2,
          work_location_3: location3,
          job_title: title,
          monthly_salary: '0',
          work_hours: hours,
          employment_months: months,
          import_group: jobId ? `job-${jobId}` : undefined,
        });
        seq += 1;
      }
    }
    return rows;
  };

  const handleOpenQuotaCreate = () => {
    ensureLookupsLoaded();
    setIsQuotaEditing(false);
    setSelectedQuotaApplicationId(null);
    setQuotaEmployerQuery('');
    setQuotaEmployerDropdownOpen(false);
    setQuotaForm({
      ...initialQuotaApplicationForm(),
      application_no: makeQuotaApplicationNoByDate(quotaApplications),
    });
    setIsQuotaModalOpen(true);
  };

  const handleOpenQuotaEdit = (row: QuotaApplicationRecord) => {
    ensureLookupsLoaded();
    setIsQuotaEditing(true);
    setSelectedQuotaApplicationId(row.id);
    setQuotaEmployerQuery(String(row.employer_name_cn || row.employer_name_en || '').trim());
    setQuotaEmployerDropdownOpen(false);
    setQuotaForm({
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
    });
    setIsQuotaModalOpen(true);
  };

  const handleTerminateQuotaApplication = (row: QuotaApplicationRecord) => {
    if (!window.confirm(`確定要終止申請「${row.application_no}」嗎？`)) return;
    const next = quotaApplications.filter((it) => it.id !== row.id);
    setQuotaApplications(next);
    writeQuotaApplications(next);
  };

  const handleSaveQuotaApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotaForm.employer_name_cn && !quotaForm.employer_name_en) {
      alert('請先選擇申請者（僱主）');
      return;
    }
    if (!quotaForm.application_no.trim()) {
      alert('請輸入申請編號');
      return;
    }
    if (!quotaForm.submitted_at) {
      alert('請輸入遞交日期');
      return;
    }
    if (!quotaForm.contact_name.trim() || !quotaForm.contact_phone_local.trim() || !quotaForm.contact_email.trim()) {
      alert('請完整填寫申請負責人的聯絡資料');
      return;
    }
    if (!/^[0-9]{7,11}$/.test(quotaForm.contact_phone_local.trim())) {
      alert('本地電話號碼格式不正確（7-11位數字）');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quotaForm.contact_email.trim())) {
      alert('電郵格式不正確');
      return;
    }

    const now = new Date().toISOString();
    if (isQuotaEditing && selectedQuotaApplicationId) {
      const next = quotaApplications.map((row) =>
        row.id === selectedQuotaApplicationId
          ? { ...row, ...quotaForm, updated_at: now }
          : row
      );
      setQuotaApplications(next);
      writeQuotaApplications(next);
    } else {
      const record: QuotaApplicationRecord = {
        id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...quotaForm,
        created_at: now,
        updated_at: now,
      };
      const next = [record, ...quotaApplications];
      setQuotaApplications(next);
      writeQuotaApplications(next);
    }
    setIsQuotaModalOpen(false);
  };

  

  const handleOpenCreate = () => {
    setFormData({ ...initialForm, approval_number: '' });
    setQuotaDetails([emptyQuotaRow()]);
    setEmployerQuery('');
    setQuotaImportId('');
    setPartnerQuery('');
    setEmployerDropdownOpen(false);
    setPartnerDropdownOpen(false);
    ensureLookupsLoaded();
    setIsEditing(false);
    setSelectedId(null);
    setIsModalOpen(true);
  };

  const exportApprovalsCsv = () => {
    const headers = ['審批編號', '僱主', '簽署人', '配額數量', '截止日期'];
    const rows = visibleApprovals.map((approval) => {
      const employerId = resolveApprovalEmployerId(approval);
      return [
        String(approval.approval_number || '').toUpperCase(),
        getEmployerDisplayById(employerId, approval.employer_name),
        approval.signatory_name || '',
        Number(approval.quota_quantity || 0),
        formatDateDisplay((approval as any).expiry_date || (approval as any).valid_until),
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approval-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenEdit = (approval: Approval) => {
    const employerId = resolveApprovalEmployerId(approval);
    const partnerId = (approval as any).partner_id ?? (approval as any).partnerId;

    setFormData({ 
      employer_id: employerId,
      partner_id: partnerId,
      approval_number: String(approval.approval_number || '').toUpperCase(),
      department: approval.department || '勞工處',
      signatory_name: approval.signatory_name || '',
      issue_date: (approval as any).issue_date ? toDateInput(String((approval as any).issue_date)) : '',
      expiry_date: (approval as any).expiry_date ? toDateInput(String((approval as any).expiry_date)) : ''
    });
    const existingQuotas = getApprovalQuotaDetails(approval.id);
    setQuotaDetails(
      existingQuotas.length > 0
        ? existingQuotas.map(q => ({
            quota_seq_start: String((q as any).quota_seq_start || q.quota_seq || ''),
            quota_seq_end: String((q as any).quota_seq_end || q.quota_seq || ''),
            work_location_1: q.work_locations?.[0] || q.work_location || '',
            work_location_2: q.work_locations?.[1] || '',
            work_location_3: q.work_locations?.[2] || '',
            job_title: q.job_title,
            monthly_salary: String(q.monthly_salary),
            work_hours: q.work_hours,
            employment_months: String(q.employment_months),
          }))
        : [emptyQuotaRow()]
    );
    setEmployerQuery(getEmployerDisplayById(employerId, approval.employer_name));
    setQuotaImportId('');
    setPartnerQuery(getPartnerDisplayById(partnerId, approval.partner_name));
    ensureLookupsLoaded();
    setIsEditing(true);
    setSelectedId(approval.id);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (approval: Approval) => {
    setDeleteTarget({
      id: approval.id,
      approvalNumber: String(approval.approval_number || '').toUpperCase(),
    });
    setDeleteReason('');
    setDeleteModalOpen(true);
  };

  const handleOpenFiles = (approval: Approval) => {
    setSelectedApprovalForFiles(approval);
    setActiveFolder(APPROVAL_FOLDERS[0]);
    setIsFileModalOpen(true);
    loadFolderFiles(approval.id, APPROVAL_FOLDERS[0], true);
    APPROVAL_FOLDERS.slice(1).forEach((folder) => {
      loadFolderFiles(approval.id, folder, false);
    });
  };

  const writeStoredFiles = (items: StoredApprovalFile[]) => {
    setStoredFiles(items);
  };

  const doUpload = async (file: File) => {
    if (!selectedApprovalForFiles) return;
    if (file.size > MAX_UPLOAD_SIZE) {
      alert('檔案大小超過 10 MB，請壓縮後再上傳');
      return;
    }
    const key = `${file.name}-${file.size}-${Date.now()}`;
    beginTask(uploadScope, key, file.name, file);
    updateTask(uploadScope, key, { percent: 0, error: '', remainingSeconds: null });
    try {
      const saved = await uploadManagedFile({
        module: 'approvals',
        owner_id: selectedApprovalForFiles.id,
        folder: activeFolder,
        file,
        retries: 1,
        onProgress: ({ percent, remainingSeconds }) => {
          updateTask(uploadScope, key, { percent, remainingSeconds });
        },
      });
      const row: StoredApprovalFile = {
        id: saved.uid,
        uid: saved.uid,
        approvalId: selectedApprovalForFiles.id,
        folder: activeFolder,
        name: saved.original_name,
        size: saved.size,
        mimeType: saved.mime_type,
        downloadUrl: saved.download_url,
        storedPath: (saved as any).stored_path,
        objectPath: (saved as any).object_path,
        uploaderId: (saved as any).uploader_id,
        uploaderName: (saved as any).uploader_name,
        uploadTime: new Date().toLocaleString(),
      };
      const cacheKey = folderCacheKey(selectedApprovalForFiles.id, activeFolder);
      const nextRows = [row, ...(fileFolderCacheRef.current[cacheKey] || [])];
      fileFolderCacheRef.current[cacheKey] = nextRows;
      writeStoredFiles(nextRows);
      succeedTask(uploadScope, key);
      alert(`上傳成功：${saved.original_name}`);
    } catch (err: any) {
      const message = normalizeErrorMessage(err, '上傳失敗');
      failTask(uploadScope, key, message, file);
    }
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedApprovalForFiles) return;
    doUpload(file);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const handleDownloadFile = (file: StoredApprovalFile) => {
    if (!file.downloadUrl) return alert('下載連結不存在，請重新上傳');
    downloadManagedFile(file.downloadUrl, file.name).catch((err: any) => {
      alert(normalizeErrorMessage(err, '下載失敗'));
    });
  };

  const handleDeleteFile = (id: string) => {
    const rec = storedFiles.find(f => f.id === id);
    if (!rec?.uid) return;
    if (!superAdmin && !canRequestDeleteFile(rec)) return;
    setDeleteContext({
      uid: rec.uid,
      fileName: rec.name,
      companyName: String(getEmployerDisplayById((selectedApprovalForFiles as any)?.employer_id, '-')),
      module: 'approvals',
      ownerId: selectedApprovalForFiles?.id || 0,
      sectionName: activeFolder,
      folder: activeFolder,
      storedPath: rec.storedPath || '',
      objectPath: rec.objectPath || '',
      uploaderId: rec.uploaderId || '',
      uploaderName: rec.uploaderName || '',
    });
    setDeleteDialogOpen(true);
  };

  const canRequestDeleteFile = (file: StoredApprovalFile) => {
    if (superAdmin) return true;
    const uploaderId = String(file.uploaderId || '').trim();
    const currentUserId = String(authIdentity.userId || '').trim();
    if (uploaderId && currentUserId) return uploaderId === currentUserId;
    const uploaderName = String(file.uploaderName || '').trim().toLowerCase();
    const currentUserName = String(authIdentity.userName || '').trim().toLowerCase();
    if (uploaderName && currentUserName) return uploaderName === currentUserName;
    return false;
  };

  const confirmPermanentDelete = async (ctx: DeleteContext) => {
    await permanentDeleteFile(ctx.uid, 'DELETE', ctx);
    const cacheKey = folderCacheKey(selectedApprovalForFiles?.id || 0, activeFolder);
    const nextRows = (fileFolderCacheRef.current[cacheKey] || storedFiles).filter(f => f.uid !== ctx.uid);
    fileFolderCacheRef.current[cacheKey] = nextRows;
    writeStoredFiles(nextRows);
    alert('刪除完成');
  };

  const submitDeleteRequest = async (ctx: DeleteContext, reason: string) => {
    const resp = await requestDeleteFile(ctx, reason);
    markDeletePending(ctx.uid);
    optimisticPendingUntilRef.current[ctx.uid] = Date.now() + 15_000;
    setDeleteStatusByUid(prev => ({ ...prev, [ctx.uid]: 'PENDING' }));
    const msg = String(resp?.message || '已提交刪除申請，等待超級管理員審核');
    pushDeleteNotice({ at: Date.now(), message: msg, uid: ctx.uid, module: ctx.module });
    pushInAppMessage({
      title: '新刪除申請待審批',
      content: `${ctx.companyName} 的檔案 ${ctx.fileName} 已提交刪除申請。`,
      recipientRoleKey: 'super_admin',
    });
    alert(msg);
  };

  const cleanupApprovalFiles = (approvalId: number) => {
    const next = storedFiles.filter(f => f.approvalId !== approvalId);
    writeStoredFiles(next);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    if (!superAdmin) {
      const reason = String(deleteReason || '').trim();
      if (!reason) {
        alert('請填寫刪除理由');
        return;
      }
      setSaving(true);
      try {
        const payload = approvals.find((x) => x.id === targetId);
        const company = getEmployerDisplayById(resolveApprovalEmployerId(payload), payload?.employer_name);
        const resp = submitEntityDeleteRequest({
          module: 'approvals',
          entityId: targetId,
          recordNo: deleteTarget.approvalNumber,
          companyName: company || '',
          reason,
        });
        alert(String((resp as any)?.message || '已提交刪除申請，等待超級管理員審批'));
        setDeleteModalOpen(false);
        setDeleteTarget(null);
        setDeleteReason('');
      } catch (err: any) {
        alert(formatApiError(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    const prevApprovals = approvals;

    setApprovals(prev => {
      const next = prev.filter(a => a.id !== targetId);
      writeApprovalsCache(next);
      return next;
    });
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteReason('');
    cleanupApprovalFiles(targetId);

    setSaving(true);
    try {
      await deleteApproval(targetId);
      await fetchApprovals();
    } catch (err: any) {
      setApprovals(prevApprovals);
      writeApprovalsCache(prevApprovals);
      alert(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (approvals.length === 0) return;
    if (employers.length > 0) return;
    getEmployers({ limit: 1000 })
      .then(list => setEmployers(list))
      .catch(() => {
      });
  }, [approvals, employers.length]);

  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    const run = async () => {
      try {
        const [employersData, partnersData] = await Promise.all([
          getEmployers({ limit: 200 }).catch(() => [] as Employer[]),
          getPartners().catch(() => [] as Partner[]),
        ]);
        if (cancelled) return;
        setEmployers(employersData);
        setPartners(partnersData);
      } catch {
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const handleDepartmentChange = async (nextDept: string) => {
    setFormData(prev => ({ ...prev, department: nextDept }));
    if (!isEditing || !selectedId) return;
    try {
      await updateApproval(selectedId, { department: nextDept });
      appendApprovalVersionLog({
        approval_id: selectedId,
        action: 'department_changed',
        detail: `發證部門變更為「${nextDept}」`,
        operator: 'admin',
      });
      setApprovals(prev => prev.map(a => (a.id === selectedId ? { ...a, department: nextDept } : a)));
    } catch (err: any) {
      alert(formatApiError(err));
    }
  };

  const validateQuotaRows = () => {
    const rows = quotaDetails.filter(r => !r._deleted);
    if (rows.length === 0) return { ok: false, message: '請至少新增一個配額數量' };
    const seqSet = new Set<string>();
    for (const r of rows) {
      const start = normalizeSeq4(String(r.quota_seq_start || ''));
      const end = normalizeSeq4(String(r.quota_seq_end || ''));
      if (!start || !end) return { ok: false, message: '配額序號範圍為必填（4位數字）' };
      if (Number(start) > Number(end)) return { ok: false, message: `配額序號範圍無效：${start}-${end}` };
      const expanded = expandQuotaSeqRange({ quota_seq_start: start, quota_seq_end: end, quota_seq: start });
      if (expanded.length === 0) return { ok: false, message: `配額序號範圍無效：${start}-${end}` };
      for (const seq of expanded) {
        if (seqSet.has(seq)) return { ok: false, message: `配額序號重複：${seq}` };
        seqSet.add(seq);
      }
      const loc1 = String(r.work_location_1 || '').trim();
      const loc2 = String(r.work_location_2 || '').trim();
      const loc3 = String(r.work_location_3 || '').trim();
      if (!loc1 || loc1.length > 200 || loc2.length > 200 || loc3.length > 200) return { ok: false, message: '工作地點1為必填，且每個工作地點不得超過200字' };
      if (!String(r.job_title || '').trim() || String(r.job_title).trim().length > 100) return { ok: false, message: '職位名稱為必填，且不得超過100字' };
      const salary = Number(formatSalary(r.monthly_salary));
      if (!Number.isInteger(salary) || salary < 0) return { ok: false, message: '每月工資為必填整數，且需大於或等於0' };
      if (!String(r.work_hours || '').trim() || String(r.work_hours).trim().length > 100) return { ok: false, message: '工作時間為必填，且不得超過100字' };
      const m = Number(String(r.employment_months || '').replace(/[^\d]/g, ''));
      if (!Number.isInteger(m) || m < 1 || m > 120) return { ok: false, message: '僱用期為必填月數，範圍1-120' };
    }
    return { ok: true, rows };
  };

  const serializeQuotaRows = (): QuotaDetail[] => {
    return quotaDetails
      .filter(r => !r._deleted)
      .map((r) => ({
        quota_seq: normalizeSeq4(String(r.quota_seq_start || '')),
        quota_seq_start: normalizeSeq4(String(r.quota_seq_start || '')),
        quota_seq_end: normalizeSeq4(String(r.quota_seq_end || '')),
        work_location: String(r.work_location_1 || '').trim(),
        work_locations: [
          String(r.work_location_1 || '').trim(),
          String(r.work_location_2 || '').trim(),
          String(r.work_location_3 || '').trim(),
        ].filter(Boolean).slice(0, 3),
        job_title: String(r.job_title || '').trim(),
        monthly_salary: Number(formatSalary(r.monthly_salary)),
        work_hours: String(r.work_hours || '').trim(),
        employment_months: Number(String(r.employment_months || '').replace(/[^\d]/g, '')),
      }));
  };

  const updateQuotaRow = (
    idx: number,
    patch: Partial<QuotaDetailForm>,
    options?: { syncGroup?: boolean }
  ) => {
    setQuotaDetails((prev) => {
      const target = prev[idx];
      if (!target) return prev;
      const syncGroup = Boolean(options?.syncGroup && target.import_group);
      if (!syncGroup) {
        return prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      }
      return prev.map((r, i) => {
        if (i === idx) return { ...r, ...patch };
        if (r.import_group && r.import_group === target.import_group) {
          return { ...r, ...patch };
        }
        return r;
      });
    });
  };

  useEffect(() => {
    if (!isModalOpen) {
      if (employerBlurTimer.current) {
        window.clearTimeout(employerBlurTimer.current);
        employerBlurTimer.current = null;
      }
      if (partnerBlurTimer.current) {
        window.clearTimeout(partnerBlurTimer.current);
        partnerBlurTimer.current = null;
      }
      setEmployerDropdownOpen(false);
      setPartnerDropdownOpen(false);
    }
  }, [isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employer_id) {
      alert('請先搜尋並選擇一個僱主');
      return;
    }
    if (!formData.approval_number || !String(formData.approval_number).trim()) {
      alert('請填寫批文編號');
      return;
    }
    const dept = String(formData.department || '').trim();
    if (!DEPARTMENT_OPTIONS.includes(dept as any)) {
      alert('請選擇正確的發證部門');
      return;
    }
    const issueDate = toDateInput(String(formData.issue_date || ''));
    if (!issueDate) {
      alert('請填寫發證日期');
      return;
    }
    const today = new Date();
    const issueObj = new Date(issueDate);
    if (Number.isNaN(issueObj.getTime()) || issueObj.getTime() > today.getTime()) {
      alert('發證日期不可大於今日');
      return;
    }
    const quotaValidation = validateQuotaRows();
    if (!quotaValidation.ok) {
      alert(quotaValidation.message);
      return;
    }

    const approvalNo = String(formData.approval_number || '').trim().toUpperCase();
    const duplicated = approvals.some(a => (a.approval_number || '').trim().toLowerCase() === approvalNo.toLowerCase() && (!isEditing || a.id !== selectedId));
    if (duplicated) {
      alert('批文編號已存在，請更換批文編號後再儲存。');
      return;
    }

    const typedButNotSelected = partnerQuery.trim().length > 0 && !formData.partner_id;
    if (typedButNotSelected) {
      alert('請從下拉清單選擇一個合作方，或清空合作方輸入框。');
      return;
    }

    // 後端 schema 要求 partner_id 必填；UI 允許不選，則自動使用系統現有的第一個合作方（不額外建立、不多打一個 API）
    let partnerId = formData.partner_id;
    if (!partnerId) {
      const list = partners.length > 0 ? partners : await refreshPartners();
      if (list.length === 0) {
        alert('目前系統沒有任何合作方，但後端要求必須提供合作方；請先到「系統設定 → 合作方」新增一個合作方。');
        return;
      }
      partnerId = list[0].id;
    }

    const payload: ApprovalCreate = {
      employer_id: formData.employer_id,
      partner_id: partnerId,
      approval_number: approvalNo,
      department: dept || '勞工處',
      signatory_name: String(formData.signatory_name || '').trim() || "",
      issue_date: toApiDate(issueDate),
      expiry_date: calcExpiryDate(issueDate),
      quota_details: serializeQuotaRows(),
    };

    setSaving(true);
    try {
      const save = async (data: ApprovalCreate) => {
        if (isEditing && selectedId) {
          const updated = await updateApproval(selectedId, data);
          setApprovalQuotaDetails(selectedId, serializeQuotaRows());
          setQuotaMapVersion(v => v + 1);
          return updated;
        } else {
          const created = await createApproval(data);
          if (created?.id) {
            setApprovalQuotaDetails(Number(created.id), serializeQuotaRows());
            setQuotaMapVersion(v => v + 1);
          }
          return created;
        }
      };

      await save(payload);

      setIsModalOpen(false);
      fetchApprovals();
    } catch (err: any) {
      const friendly = guessFriendly500(err);
      if (friendly) {
        alert(friendly);
        return;
      }
      const status = err?.response?.status as number | undefined;
      const responseText = err?.response?.data
        ? typeof err.response.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response.data)
        : '';
      const payloadText = JSON.stringify(payload);
      if (status === 500) {
        alert(`HTTP 500：後端建立批文失敗。\n\nRequest: ${payloadText}\n\nResponse: ${responseText}`.slice(0, 900));
      } else {
        alert(formatApiError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">批文管理</h1>
          <p className="text-gray-500 mt-1">管理各僱主的人力配額批文</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增批文</span>
        </button>
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 flex items-center justify-between bg-white/50">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="搜尋批文編號..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button onClick={exportApprovalsCsv} className="px-3 py-1.5 rounded border border-gray-200 text-sm hover:bg-gray-50">
              匯出報表
            </button>
            <button onClick={fetchApprovals} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors">
              <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-sm border-b border-red-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批文編號</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬僱主</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">簽署人</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配額數量</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">截止日期</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && approvals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                    <p className="text-gray-500 mt-2">載入中...</p>
                  </td>
                </tr>
              ) : visibleApprovals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {error
                      ? '後端批文服務暫時不可用，請稍後再刷新'
                      : hasLoaded
                        ? '找不到符合條件的批文'
                        : '尚未載入批文資料，請點右側刷新按鈕取得列表'}
                  </td>
                </tr>
              ) : (
                visibleApprovals.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-600 font-medium border border-indigo-200 shrink-0">
                          {String(approval.approval_number || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{String(approval.approval_number || '').toUpperCase()}</div>
                          <div className="text-sm text-gray-500">{approval.department || '-'}</div>
                        </div>
                      </div>
                    </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[260px] truncate"
                        title={getEmployerDisplayById(resolveApprovalEmployerId(approval), approval.employer_name)}
                      >
                        {getEmployerDisplayById(resolveApprovalEmployerId(approval), approval.employer_name)}
                      </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {approval.signatory_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-apple-dark">
                      {countQuotaSlots(quotaMap[String(approval.id)] || [])} 個
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateDisplay((approval as any).expiry_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => handleOpenFiles(approval)}
                        className="text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 p-2 rounded-full transition-colors"
                        title="儲存空間"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleOpenEdit(approval)}
                        className="ml-2 text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDelete(approval)}
                        className="ml-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        title={isQuotaEditing ? '編輯申請配額' : '新增申請配額'}
        className="max-w-3xl"
      >
        <form onSubmit={handleSaveQuotaApplication} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請類別 *</label>
              <select
                value={quotaForm.category}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, category: e.target.value as QuotaApplicationCategory }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {QUOTA_APP_CATEGORY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請編號 *</label>
              <input
                type="text"
                value={quotaForm.application_no}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, application_no: e.target.value.toUpperCase() }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者名稱（選擇僱主）*</label>
              <div className="relative">
                <input
                  type="text"
                  value={quotaEmployerQuery}
                  onChange={(e) => {
                    setQuotaEmployerQuery(e.target.value);
                    setQuotaEmployerDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (quotaEmployerBlurTimer.current) window.clearTimeout(quotaEmployerBlurTimer.current);
                    setQuotaEmployerDropdownOpen(true);
                  }}
                  onBlur={() => {
                    quotaEmployerBlurTimer.current = window.setTimeout(() => setQuotaEmployerDropdownOpen(false), 150);
                  }}
                  placeholder="輸入僱主名稱或BR編號搜尋..."
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
                {quotaEmployerDropdownOpen && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden">
                    {filteredQuotaEmployers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">找不到符合條件的僱主</div>
                    ) : (
                      filteredQuotaEmployers.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                          onMouseDown={(evt) => evt.preventDefault()}
                          onClick={() => fillQuotaFormByEmployer(e)}
                        >
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
              <input
                type="text"
                value={quotaForm.employer_name_cn}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, employer_name_cn: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者名稱（英文）</label>
              <input
                type="text"
                value={quotaForm.employer_name_en}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, employer_name_en: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">業務經營模式 *</label>
              <select
                value={quotaForm.business_mode}
                onChange={(e) => {
                  const nextMode = e.target.value as QuotaApplicationBusinessMode;
                  const selectedEmployer = employers.find((x) => x.id === quotaForm.employer_id);
                  setQuotaForm((prev) => ({
                    ...prev,
                    business_mode: nextMode,
                    company_incorporation_number: nextMode === '有限公司' ? String(selectedEmployer?.company_incorporation_number || prev.company_incorporation_number || '').trim() : '',
                  }));
                }}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {QUOTA_APP_BUSINESS_MODE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">公司註冊證編號（CI）</label>
              <input
                type="text"
                value={quotaForm.company_incorporation_number}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, company_incorporation_number: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">商業登記號碼（BR）</label>
              <input
                type="text"
                value={quotaForm.business_registration_number}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, business_registration_number: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">業務性質</label>
              <input
                type="text"
                value={quotaForm.business_type}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, business_type: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">遞交日期 *</label>
              <input
                type="date"
                value={quotaForm.submitted_at}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, submitted_at: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">狀態 *</label>
              <select
                value={quotaForm.status}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, status: e.target.value as QuotaApplicationStatus }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {QUOTA_APP_STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者地址（中文）</label>
              <input
                type="text"
                value={quotaForm.applicant_address_cn}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, applicant_address_cn: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請者地址（英文）</label>
              <input
                type="text"
                value={quotaForm.applicant_address_en}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, applicant_address_en: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合法經營業務所需牌照 *</label>
              <select
                value={quotaForm.license_required}
                onChange={(e) => setQuotaForm((prev) => ({ ...prev, license_required: e.target.value as QuotaApplicationLicense }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {QUOTA_APP_LICENSE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          <div className="border border-gray-200 rounded-apple-sm p-4 bg-white/40">
            <div className="text-sm font-semibold text-gray-800 mb-3">申請負責人的聯絡資料</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">姓名 *</label>
                <input
                  type="text"
                  value={quotaForm.contact_name}
                  onChange={(e) => setQuotaForm((prev) => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">本地電話號碼 *</label>
                <input
                  type="text"
                  value={quotaForm.contact_phone_local}
                  onChange={(e) => setQuotaForm((prev) => ({ ...prev, contact_phone_local: e.target.value.replace(/[^\d]/g, '').slice(0, 11) }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  placeholder="7-11位數字"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">電郵 *</label>
                <input
                  type="email"
                  value={quotaForm.contact_email}
                  onChange={(e) => setQuotaForm((prev) => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setIsQuotaModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors"
            >
              {isQuotaEditing ? '儲存修改' : '建立申請'}
            </button>
          </div>
        </form>
      </Modal>

      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">系統提示</h3>
            <p className="text-gray-200 text-base mb-4 leading-relaxed">
              {superAdmin
                ? `確定要刪除批文「${deleteTarget.approvalNumber}」嗎？刪除後數據無法回復。`
                : `確定要申請刪除批文「${deleteTarget.approvalNumber}」嗎？需經超級管理員審批後才會正式刪除。`}
            </p>
            {!superAdmin && (
              <div className="mb-4">
                <label className="block text-sm text-gray-300 mb-1">刪除理由 *</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                  placeholder="請輸入申請刪除原因"
                />
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteTarget(null);
                  setDeleteReason('');
                }}
                disabled={saving}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-apple-blue text-white hover:bg-blue-600 transition-colors flex items-center"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {superAdmin ? '確認刪除' : '提交刪除申請'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quotaDeleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">系統提示</h3>
            <p className="text-gray-200 text-base mb-8 leading-relaxed">
              確定要刪除這個配額數量嗎？刪除後將留下版本紀錄。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setQuotaDeleteTarget(null)}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = quotaDeleteTarget;
                  if (idx === null) return;
                  const seqStart = quotaDetails[idx]?.quota_seq_start || '';
                  const seqEnd = quotaDetails[idx]?.quota_seq_end || '';
                  const seq = seqStart || seqEnd ? `${normalizeSeq4(seqStart)}-${normalizeSeq4(seqEnd || seqStart)}` : `row-${idx + 1}`;
                  setQuotaDetails(prev => prev.filter((_, i) => i !== idx));
                  if (isEditing && selectedId) {
                    appendApprovalVersionLog({
                      approval_id: selectedId,
                      action: 'quota_deleted',
                      detail: `刪除配額數量：序號範圍 ${String(seq)}`,
                      operator: 'admin',
                    });
                  }
                  setQuotaDeleteTarget(null);
                }}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isFileModalOpen}
        onClose={() => {
          clearScope(uploadScope);
          setIsFileModalOpen(false);
        }}
        title={`儲存空間 - 批文 ${String(selectedApprovalForFiles?.approval_number || '').toUpperCase()}`}
        className="max-w-4xl"
      >
        <div className="flex h-[500px] -mx-6 -mb-6 border-t border-gray-200">
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-4 space-y-2 shrink-0">
            {APPROVAL_FOLDERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFolder(f)}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-apple-sm text-sm font-medium transition-colors flex items-center space-x-2",
                  activeFolder === f
                    ? "bg-apple-blue text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200"
                )}
              >
                <FolderOpen className={clsx("w-4 h-4", activeFolder === f ? "text-white" : "text-gray-400")} />
                <span>{f}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col bg-white">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white/50">
              <h3 className="font-medium text-gray-800 flex items-center">
                <span className="text-gray-400 mr-2">/</span>
                {activeFolder}
              </h3>
              <div>
                <input
                  type="file"
                  ref={uploadInputRef}
                  className="hidden"
                  onChange={handleUploadFile}
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center space-x-2 bg-white border border-apple-blue text-apple-blue hover:bg-blue-50 px-3 py-1.5 rounded-apple-sm transition-colors text-sm font-medium"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>上傳檔案</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {uploadTasks.length > 0 && (
                <div className="mb-3 space-y-2">
                  {uploadTasks.map((task) => (
                    <div key={task.key} className="p-2 border border-gray-200 rounded bg-gray-50">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span className="truncate max-w-[70%]">{task.name}</span>
                        <span>{Math.round(task.percent)}%{task.remainingSeconds && task.remainingSeconds > 0 ? ` · 剩餘 ${task.remainingSeconds} 秒` : ''}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded mt-1 overflow-hidden">
                        <div className="h-2 bg-apple-blue" style={{ width: `${task.percent}%` }} />
                      </div>
                      {task.error && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-red-600">{task.error}</span>
                          {task.retryFile && (
                            <button
                              type="button"
                              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={() => doUpload(task.retryFile!)}
                            >
                              重試
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {storedFiles.filter(f => f.approvalId === selectedApprovalForFiles?.id && f.folder === activeFolder).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                  <FolderOpen className="w-12 h-12 text-gray-300" />
                  <p>此資料夾目前沒有檔案</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {storedFiles
                    .filter(f => f.approvalId === selectedApprovalForFiles?.id && f.folder === activeFolder)
                    .map(file => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-apple-sm hover:shadow-sm transition-shadow group">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="p-2 bg-blue-50 text-apple-blue rounded-apple-sm shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB • {file.uploadTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file)}
                            className="p-1.5 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-md transition-colors"
                            title="下載"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {superAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id)}
                              className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              title="刪除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id)}
                              disabled={
                                !canRequestDeleteFile(file) ||
                                deleteStatusByUid[file.uid] === 'PENDING' ||
                                deleteStatusByUid[file.uid] === 'APPROVED'
                              }
                              className={clsx(
                                "px-2 py-1 text-xs rounded border",
                                canRequestDeleteFile(file) &&
                                  deleteStatusByUid[file.uid] !== 'PENDING' &&
                                  deleteStatusByUid[file.uid] !== 'APPROVED'
                                  ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                  : "border-gray-200 text-gray-400 bg-gray-100 cursor-not-allowed"
                              )}
                              title={
                                deleteStatusByUid[file.uid] === 'PENDING'
                                  ? "待審批"
                                  : deleteStatusByUid[file.uid] === 'APPROVED'
                                    ? "已刪除"
                                    : canRequestDeleteFile(file)
                                      ? "申請刪除"
                                      : "僅上傳者可申請刪除"
                              }
                            >
                              {deleteStatusByUid[file.uid] === 'PENDING'
                                ? '待刪'
                                : deleteStatusByUid[file.uid] === 'APPROVED'
                                  ? '已刪除'
                                  : '申請刪除'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <FileDeleteActionDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        context={deleteContext}
        onConfirmPermanentDelete={confirmPermanentDelete}
        onSubmitRequest={submitDeleteRequest}
      />

      {/* Approval Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "編輯批文資料" : "新增批文"}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱主 *</label>
              <div className="relative">
                <input
                  type="text"
                  value={employerQuery}
                  onChange={(e) => {
                    setEmployerQuery(e.target.value);
                    setEmployerDropdownOpen(true);
                    setQuotaImportId('');
                    setFormData(prev => ({ ...prev, employer_id: undefined }));
                  }}
                  onFocus={() => {
                    if (employerBlurTimer.current) window.clearTimeout(employerBlurTimer.current);
                    setEmployerDropdownOpen(true);
                  }}
                  onBlur={() => {
                    employerBlurTimer.current = window.setTimeout(() => setEmployerDropdownOpen(false), 150);
                  }}
                  placeholder="輸入僱主代碼或名稱..."
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all overflow-hidden text-ellipsis whitespace-nowrap"
                  required
                />
                {employerDropdownOpen && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden">
                    {filteredEmployers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">找不到符合條件的僱主</div>
                    ) : (
                      filteredEmployers.map(e => (
                        <button
                          key={e.id}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                          onMouseDown={(evt) => evt.preventDefault()}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, employer_id: e.id }));
                            setEmployerQuery(getEmployerLabel(e));
                            setQuotaImportId('');
                            setEmployerDropdownOpen(false);
                          }}
                        >
                          <div className="text-sm font-medium text-gray-900">{getEmployerLabel(e)}</div>
                          {(e.english_name || e.business_registration_number) && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {e.english_name || ''}{e.english_name && e.business_registration_number ? ' · ' : ''}{e.business_registration_number || ''}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合作方 (選填)</label>
              <div className="relative">
                <input
                  type="text"
                  value={partnerQuery}
                  onChange={(e) => {
                    setPartnerQuery(e.target.value);
                    setPartnerDropdownOpen(true);
                    setFormData(prev => ({ ...prev, partner_id: undefined }));
                  }}
                  onFocus={() => {
                    if (partnerBlurTimer.current) window.clearTimeout(partnerBlurTimer.current);
                    setPartnerDropdownOpen(true);
                  }}
                  onBlur={() => {
                    partnerBlurTimer.current = window.setTimeout(() => setPartnerDropdownOpen(false), 150);
                  }}
                  placeholder="輸入合作方名稱..."
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all overflow-hidden text-ellipsis whitespace-nowrap"
                />
                <div className="text-xs text-gray-500 mt-1 ml-1">留空可直接儲存，系統會自動處理預設綁定</div>
                {partnerQuery && (
                  <button
                    type="button"
                    onMouseDown={(evt) => evt.preventDefault()}
                    onClick={() => {
                      setPartnerQuery('');
                      setFormData(prev => ({ ...prev, partner_id: undefined }));
                    }}
                    className="absolute inset-y-0 right-2 text-gray-400 hover:text-gray-600 text-sm"
                    title="清除"
                  >
                    ×
                  </button>
                )}
                {partnerDropdownOpen && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden">
                    {filteredPartners.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">找不到符合條件的合作方</div>
                    ) : (
                      filteredPartners.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                          onMouseDown={(evt) => evt.preventDefault()}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, partner_id: p.id }));
                            setPartnerQuery(p.name);
                            setPartnerDropdownOpen(false);
                          }}
                        >
                          <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">審批編號 *</label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={String(formData.approval_number || '').toUpperCase()}
                  onChange={(e) => setFormData({...formData, approval_number: e.target.value.toUpperCase()})}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
                <select
                  value={quotaImportId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setQuotaImportId(id);
                    const selected = importableQuotaApplications.find((x) => x.id === id);
                    if (!selected) return;
                    const appNo = String(selected.application_no || '').trim().toUpperCase();
                    if (!appNo) return;
                    setFormData((prev) => ({ ...prev, approval_number: appNo }));
                    const importedRows = buildQuotaRowsFromApplication(selected);
                    if (importedRows.length > 0) {
                      setQuotaDetails(importedRows);
                    }
                  }}
                  disabled={!formData.employer_id}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {formData.employer_id ? '選擇已批出申請配額以導入申請編號' : '請先選擇僱主'}
                  </option>
                  {importableQuotaApplications.map((row) => (
                    <option key={row.id} value={row.id}>
                      {`${String(row.application_no || '(未填申請編號)').toUpperCase()} · ${String(row.submitted_at || '未填日期')}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">發證部門</label>
              <select
                value={String(formData.department || '勞工處')}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              >
                {DEPARTMENT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">簽署人姓名</label>
              <input
                type="text"
                value={formData.signatory_name}
                onChange={(e) => setFormData({...formData, signatory_name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">發證日期</label>
              <input
                type="date"
                value={formData.issue_date || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormData({...formData, issue_date: v, expiry_date: calcExpiryDate(v)});
                }}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">截止日期（系統自動計算）</label>
              <input
                type="date"
                value={String(formData.expiry_date || calcExpiryDate(String(formData.issue_date || '')) || '')}
                readOnly
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-apple-sm text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="bg-white/50 border border-gray-200/50 rounded-apple-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800">配額數量</div>
              <button
                type="button"
                onClick={() => setQuotaDetails(prev => [...prev, emptyQuotaRow()])}
                className="px-3 py-1.5 bg-apple-blue text-white rounded-apple-sm text-sm hover:bg-blue-600 transition-colors"
              >
                新增配額
              </button>
            </div>
            <div className="space-y-3">
              {quotaDetails.map((row, idx) => (
                <div key={idx} className="border border-gray-200 rounded-apple-sm p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-500">
                      配額項目 #{idx + 1}
                      {row.import_group && <span className="ml-2 text-apple-blue">已按職位分組</span>}
                    </div>
                    {row.import_group && (
                      <button
                        type="button"
                        onClick={() => {
                          const patch: Partial<QuotaDetailForm> = {
                            work_location_1: row.work_location_1,
                            work_location_2: row.work_location_2,
                            work_location_3: row.work_location_3,
                            job_title: row.job_title,
                            monthly_salary: row.monthly_salary,
                            work_hours: row.work_hours,
                            employment_months: row.employment_months,
                          };
                          updateQuotaRow(idx, patch, { syncGroup: true });
                        }}
                        className="px-2 py-1 text-xs border border-apple-blue text-apple-blue rounded-apple-sm hover:bg-blue-50"
                      >
                        同步同職位
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">配額序號範圍（起）*</label>
                      <input
                        type="text"
                        value={row.quota_seq_start}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                          updateQuotaRow(idx, { quota_seq_start: v });
                        }}
                        onBlur={() => {
                          updateQuotaRow(idx, { quota_seq_start: row.quota_seq_start ? row.quota_seq_start.padStart(4, '0') : '' });
                        }}
                        placeholder="0001"
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">配額序號範圍（止）*</label>
                      <input
                        type="text"
                        value={row.quota_seq_end}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                          updateQuotaRow(idx, { quota_seq_end: v });
                        }}
                        onBlur={() => {
                          updateQuotaRow(idx, { quota_seq_end: row.quota_seq_end ? row.quota_seq_end.padStart(4, '0') : '' });
                        }}
                        placeholder="0005"
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                      <div className="text-[11px] text-gray-500 mt-1">
                        範圍：{normalizeSeq4(row.quota_seq_start || '') || '0000'} - {normalizeSeq4(row.quota_seq_end || '') || '0000'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">工作地點1 *</label>
                      <input
                        type="text"
                        maxLength={200}
                        value={row.work_location_1}
                        onChange={(e) => updateQuotaRow(idx, { work_location_1: e.target.value }, { syncGroup: true })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">工作地點2（選填）</label>
                      <input
                        type="text"
                        maxLength={200}
                        value={row.work_location_2}
                        onChange={(e) => updateQuotaRow(idx, { work_location_2: e.target.value }, { syncGroup: true })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">工作地點3（選填）</label>
                      <input
                        type="text"
                        maxLength={200}
                        value={row.work_location_3}
                        onChange={(e) => updateQuotaRow(idx, { work_location_3: e.target.value }, { syncGroup: true })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">職位名稱 *</label>
                      <input
                        type="text"
                        maxLength={100}
                        value={row.job_title}
                        onChange={(e) => updateQuotaRow(idx, { job_title: e.target.value }, { syncGroup: true })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">每月工資 *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.monthly_salary}
                        onChange={(e) => {
                          const v = formatSalary(e.target.value);
                          updateQuotaRow(idx, { monthly_salary: v }, { syncGroup: true });
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                      {row.monthly_salary && <div className="text-xs text-gray-500 mt-1">格式化：{prettySalary(row.monthly_salary)}</div>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">工作時間 *</label>
                      <input
                        type="text"
                        maxLength={100}
                        value={row.work_hours}
                        onChange={(e) => updateQuotaRow(idx, { work_hours: e.target.value }, { syncGroup: true })}
                        placeholder="每週 X 天，每天 Y 小時"
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">僱用期（月）*</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.employment_months}
                        onChange={(e) => updateQuotaRow(idx, { employment_months: e.target.value.replace(/[^\d]/g, '').slice(0, 3) }, { syncGroup: true })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      type="button"
                      onClick={() => setQuotaDeleteTarget(idx)}
                      className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-apple-sm text-sm"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-3">支援「新增配額」、刪除與暫存（未儲存前可持續編輯）。</div>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? '儲存中...' : '儲存'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Approvals;
