import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw, Briefcase, GraduationCap, Link2, Home, Mail, Trash2, FolderOpen, UploadCloud, Download } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { Worker, WorkerCreate, createWorker, deleteWorker, updateWorker } from '../api/workers';
import { Employer } from '../api/employers';
import { Approval, expandQuotaSeqRange, getApprovalQuotaDetails, QuotaDetail } from '../api/approvals';
import { WorkerEducation, WorkerProfile, WorkerWorkExperience, getWorkerProfile, setWorkerProfile } from '../utils/workerProfile';
import { WorkerFileCategory, WorkerFileMeta, uploadWorkerFile } from '../api/workerFiles';
import { downloadManagedFile, MAX_UPLOAD_SIZE } from '../api/files';
import { PHONE_CODES, labourStatusOptions, labourStatusToApi, labourStatusToUi, normalizeDate, isPhoneNumber, formatEmploymentMonths, parseEmploymentMonths } from '../utils/workersForm';
import { normalizeErrorMessage } from '../utils/errorMessage';
import { useUploadStore } from '../store/uploadStore';
import { DeleteContext, listDeleteRequests, permanentDeleteFile, requestDeleteFile } from '../api/fileDeletion';
import { getAuthIdentity, isSuperAdmin } from '../utils/authRole';
import FileDeleteActionDialog from '../components/FileDeleteActionDialog';
import { pushDeleteNotice } from '../utils/deleteNotifications';
import { pushInAppMessage } from '../utils/inAppMessages';
import { markDeletePending, releaseDeletePending } from '../utils/deletePendingState';
import { useWorkersPageData } from '../features/workers/hooks/useWorkersPageData';
import { buildWorkerSubmitPayload, validateWorkerSubmitInput } from '../features/workers/form/workerSubmitService';
import { submitEntityDeleteRequest } from '../utils/entityDeleteRequests';
import { resolveApprovalEmployerId } from '../utils/approvalEmployer';
import { toWorkerNamePinyin } from '../utils/namePinyin';
import { LabourCompany, readLabourCompanies } from '../utils/labourCompanies';
import { refreshLabourCompanyDispatchStats } from '../utils/labourCompanyStats';

const MAX_FILES_PER_CATEGORY = 10;
const MAX_FILE_SIZE = MAX_UPLOAD_SIZE;
const ACCEPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

type FileTab = WorkerFileCategory;
type WorkerFolder = '證件資料' | '學歷證明' | '工作證明';

interface StoredFile {
  id: string;
  workerId: number;
  folder: WorkerFolder;
  uid: string;
  name: string;
  size: number;
  mimeType: string;
  downloadUrl?: string;
  storedPath?: string;
  objectPath?: string;
  uploaderId?: string;
  uploaderName?: string;
  uploadTime: string;
}

const FILE_FOLDERS: WorkerFolder[] = ['證件資料', '學歷證明', '工作證明'];
const folderToCategory = (f: WorkerFolder): FileTab => (f === '證件資料' ? 'id_docs' : f === '學歷證明' ? 'education_docs' : 'work_docs');

const emptyExperience = (): WorkerWorkExperience => ({ company_name: '', start_date: '', end_date: '' });
const emptyEducation = (): WorkerEducation => ({ school_name: '', start_date: '', graduation_date: '' });
const emptyFiles = () => ({ id_docs: [], education_docs: [], work_docs: [] });

const initialForm: WorkerCreate = {
  labour_name: '',
  id_card_number: '',
  labour_status: '辦證中',
  contract_salary: '',
  employment_term: '',
  employer_id: undefined,
  approval_id: undefined,
};

const Workers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [renderCount, setRenderCount] = useState(120);
  const {
    workers,
    setWorkers,
    loading,
    error,
    hasLoaded,
    employers,
    approvals,
    fetchWorkers,
  } = useWorkersPageData(search);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<WorkerCreate>(initialForm);
  const [labourCompanies, setLabourCompanies] = useState<LabourCompany[]>([]);
  const [pinyinTouched, setPinyinTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<WorkerProfile>({
    work_experiences: [emptyExperience()],
    educations: [emptyEducation()],
    entry_refused: false,
    marital_status: 'single',
    phone_code: '+852',
    phone_number: '',
    files: emptyFiles(),
  });
  const [uploadingCategory, setUploadingCategory] = useState<FileTab | null>(null);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedWorkerForFiles, setSelectedWorkerForFiles] = useState<Worker | null>(null);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [activeFolder, setActiveFolder] = useState<WorkerFolder>('證件資料');
  const [dragOver, setDragOver] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteContext, setDeleteContext] = useState<DeleteContext | null>(null);
  const [deleteStatusByUid, setDeleteStatusByUid] = useState<Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'>>({});
  const optimisticPendingUntilRef = useRef<Record<string, number>>({});
  const superAdmin = isSuperAdmin();
  const authIdentity = getAuthIdentity();

  const [employerQuery, setEmployerQuery] = useState('');
  const [approvalQuery, setApprovalQuery] = useState('');
  const [employerDropdownOpen, setEmployerDropdownOpen] = useState(false);
  const [approvalDropdownOpen, setApprovalDropdownOpen] = useState(false);
  const employerBlurTimer = useRef<number | null>(null);
  const approvalBlurTimer = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadScope = `workers:${selectedWorkerForFiles?.id || 0}:${activeFolder}`;
  const tasksByScope = useUploadStore(s => s.tasksByScope);
  const beginTask = useUploadStore(s => s.beginTask);
  const updateTask = useUploadStore(s => s.updateTask);
  const failTask = useUploadStore(s => s.failTask);
  const succeedTask = useUploadStore(s => s.succeedTask);
  const clearScope = useUploadStore(s => s.clearScope);
  const uploadTasks = useMemo(() => Object.values(tasksByScope[uploadScope] || {}), [tasksByScope, uploadScope]);

  useEffect(() => {
    setRenderCount(120);
  }, [search]);

  const employerId = Number((formData as any).employer_id || 0) || undefined;
  const approvalId = Number((formData as any).approval_id || profile.approval_id || 0) || undefined;
  const selectedQuotaSeq = String(profile.quota_seq || '').trim();
  const selectedApprovalQuotaDetails = useMemo<QuotaDetail[]>(() => {
    if (!approvalId) return [];
    return getApprovalQuotaDetails(approvalId);
  }, [approvalId, approvals]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mock_worker_files');
      const parsed = raw ? JSON.parse(raw) : [];
      setStoredFiles(Array.isArray(parsed) ? parsed : []);
    } catch {
      setStoredFiles([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('mock_worker_files', JSON.stringify(storedFiles));
    } catch {
    }
  }, [storedFiles]);

  useEffect(() => {
    const loadCompanies = () => setLabourCompanies(readLabourCompanies());
    loadCompanies();
    const onStorage = (evt: StorageEvent) => {
      if (evt.key && evt.key !== 'labour_companies_v1') return;
      loadCompanies();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    setLabourCompanies(readLabourCompanies());
  }, [isModalOpen]);

  useEffect(() => {
    refreshLabourCompanyDispatchStats(workers || []);
  }, [workers]);

  useEffect(() => {
    if (!isFileModalOpen || !selectedWorkerForFiles || superAdmin) return;
    let canceled = false;
    const loadDeleteStatuses = async () => {
      try {
        const rows = await listDeleteRequests();
        if (canceled) return;
        const next: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'> = {};
        for (const row of rows) {
          if (String(row.module) !== 'workers') continue;
          if (Number(row.owner_id || 0) !== Number(selectedWorkerForFiles.id)) continue;
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
  }, [isFileModalOpen, selectedWorkerForFiles, superAdmin]);

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
      const finalKey = key && key !== '|||' ? key : `id:${String((e as any).id ?? '')}`;
      if (seen.has(finalKey)) continue;
      seen.add(finalKey);
      list.push(e);
    }

    return list.slice(0, 8);
  }, [employers, employerQuery]);

  const filteredApprovals = useMemo(() => {
    const employerFiltered = employerId
      ? approvals.filter(a => resolveApprovalEmployerId(a) === employerId)
      : approvals;
    const q = approvalQuery.trim().toLowerCase();
    const raw = q
      ? employerFiltered.filter(a => String(a.approval_number || '').toLowerCase().includes(q))
      : employerFiltered;
    const seen = new Set<string>();
    const list: Approval[] = [];
    for (const a of raw) {
      const key = String(a.approval_number || '').trim().toLowerCase() || `id:${String((a as any).id ?? '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(a);
    }
    return list.slice(0, 8);
  }, [approvals, approvalQuery, employerId]);

  const quotaOptions = useMemo(() => {
    const occupiedSeqSet = new Set<string>();
    for (const w of workers) {
      if (selectedId && Number(w.id) === Number(selectedId)) continue;
      const wApprovalId = Number((w as any).approval_id || 0);
      if (!approvalId || wApprovalId !== Number(approvalId)) continue;
      const uiStatus = labourStatusToUi((w as any).labour_status || '');
      if (uiStatus === '離職') continue;
      const seq = String((w as any).quota_seq || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
      if (seq) occupiedSeqSet.add(seq);
    }
    const currentSeq = String(selectedQuotaSeq || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
    const expanded = selectedApprovalQuotaDetails.flatMap((q) =>
      expandQuotaSeqRange(q).map((seq) => ({
        seq,
        detail: q,
      }))
    );
    return expanded.filter(x => !occupiedSeqSet.has(x.seq) || x.seq === currentSeq);
  }, [selectedApprovalQuotaDetails, workers, approvalId, selectedId, selectedQuotaSeq]);

  const selectedQuotaDetail = useMemo(() => {
    const key = String(selectedQuotaSeq || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
    if (!key) return undefined;
    return quotaOptions.find(x => x.seq === key)?.detail;
  }, [quotaOptions, selectedQuotaSeq]);

  useEffect(() => {
    if (!approvalId) return;
    const matchedApproval = approvals.find(a => Number((a as any).id) === Number(approvalId));
    const employerMatched = matchedApproval
      ? resolveApprovalEmployerId(matchedApproval) === Number(employerId || 0)
      : false;
    if (!employerMatched) {
      setFormData(prev => ({ ...prev, approval_id: undefined }));
      setApprovalQuery('');
      setProfile(prev => ({
        ...prev,
        approval_id: undefined,
        approval_number: undefined,
        quota_seq: '',
        work_locations: [],
      }));
    }
  }, [approvalId, employerId, approvals]);

  useEffect(() => {
    if (!employerId) return;
    const hasApprovalsForEmployer = approvals.some(
      (a) => resolveApprovalEmployerId(a) === Number(employerId)
    );
    if (!hasApprovalsForEmployer) {
      setFormData(prev => ({ ...prev, approval_id: undefined }));
      setApprovalQuery('');
      setProfile(prev => ({
        ...prev,
        approval_id: undefined,
        approval_number: undefined,
        quota_seq: '',
        work_locations: [],
      }));
    }
  }, [employerId, approvals]);

  useEffect(() => {
    if (!selectedQuotaSeq) return;
    const key = String(selectedQuotaSeq).replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
    const exists = quotaOptions.some(x => x.seq === key);
    if (!exists) {
      setProfile(prev => ({
        ...prev,
        quota_seq: '',
        work_locations: [],
      }));
    }
  }, [selectedQuotaSeq, quotaOptions]);

  const employerLabel = (e: Employer) => `${e.name}`.trim();
  const approvalLabel = (a: Approval) => String(a.approval_number || '').toUpperCase();

  const addExperience = () => {
    setProfile(prev => ({
      ...prev,
      work_experiences: [...(prev.work_experiences || []), emptyExperience()],
    }));
  };

  const addEducation = () => {
    setProfile(prev => ({
      ...prev,
      educations: [...(prev.educations || []), emptyEducation()],
    }));
  };

  const applyQuotaToWorkerForm = (seqRaw: string) => {
    const seq = String(seqRaw || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
    const quota = quotaOptions.find(x => x.seq === seq)?.detail;
    setProfile(prev => ({
      ...prev,
      quota_seq: seq,
      work_locations: quota
        ? (Array.isArray((quota as any).work_locations) ? (quota as any).work_locations : [String((quota as any).work_location || '')])
            .map((x: any) => String(x || '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : [],
    }));
    if (quota) {
      const salary = Number((quota as any).monthly_salary);
      const months = Number((quota as any).employment_months);
      setFormData(prev => ({
        ...prev,
        contract_salary: Number.isFinite(salary) ? String(salary) : prev.contract_salary,
        employment_term: Number.isFinite(months) && months > 0 ? String(months) : prev.employment_term,
      }));
    }
  };

  const openWorkerFiles = (worker: Worker) => {
    setSelectedWorkerForFiles(worker);
    setActiveFolder('證件資料');
    setIsFileModalOpen(true);
  };

  const processUploadFiles = async (files: File[], category: FileTab, workerId: number) => {
    const existingCount = storedFiles.filter(f => f.workerId === workerId && folderToCategory(f.folder) === category).length;
    if (existingCount + files.length > MAX_FILES_PER_CATEGORY) {
      alert(`每個分類最多上傳 ${MAX_FILES_PER_CATEGORY} 個檔案`);
      return;
    }
    for (const f of files) {
      if (!ACCEPT_TYPES.has(f.type)) {
        alert(`檔案類型不支援：${f.name}（只允許 pdf/jpg/png）`);
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        alert('檔案大小超過 10 MB，請壓縮後再上傳');
        return;
      }
    }

    setUploadingCategory(category);
    try {
      for (const f of files) {
        const key = `${f.name}-${f.size}-${Date.now()}`;
        beginTask(uploadScope, key, f.name, f);
        updateTask(uploadScope, key, { percent: 5, error: '', remainingSeconds: null, retryFile: f });
        try {
          const saved: WorkerFileMeta = await uploadWorkerFile({
            owner_id: workerId,
            category,
            file_name: f.name,
            mime_type: f.type,
            data_url: '',
            file: f,
            onProgress: ({ percent, remainingSeconds }) => {
              updateTask(uploadScope, key, { percent, remainingSeconds });
            },
          });

          const folder = activeFolder;
          setStoredFiles(prev => [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              workerId,
              folder,
              uid: saved.uid,
              name: saved.original_name,
              size: saved.size,
              mimeType: saved.mime_type,
              downloadUrl: (saved as any).download_url,
              storedPath: (saved as any).stored_path,
              objectPath: (saved as any).object_path,
              uploaderId: (saved as any).uploader_id,
              uploaderName: (saved as any).uploader_name,
              uploadTime: new Date().toLocaleString(),
            },
            ...prev,
          ]);
          succeedTask(uploadScope, key);
        } catch (err: any) {
          failTask(uploadScope, key, normalizeErrorMessage(err, '上傳失敗'), f);
        }
      }
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleUploadFromInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedWorkerForFiles) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processUploadFiles(files, folderToCategory(activeFolder), selectedWorkerForFiles.id);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const handleDropUpload = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!selectedWorkerForFiles) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await processUploadFiles(files, folderToCategory(activeFolder), selectedWorkerForFiles.id);
  };

  const handleDeleteStoredFile = async (id: string, uid: string) => {
    const target = storedFiles.find(f => f.id === id && f.uid === uid);
    if (!target) return;
    if (!superAdmin && !canRequestDeleteFile(target)) return;
    setDeleteContext({
      uid: target.uid,
      fileName: target.name,
      companyName: selectedWorkerForFiles?.labour_name || '-',
      module: 'workers',
      ownerId: selectedWorkerForFiles?.id || 0,
      sectionName: activeFolder,
      folder: activeFolder,
      storedPath: target.storedPath || '',
      objectPath: target.objectPath || '',
      uploaderId: target.uploaderId || '',
      uploaderName: target.uploaderName || '',
    });
    setDeleteDialogOpen(true);
  };

  const confirmPermanentDelete = async (ctx: DeleteContext) => {
    await permanentDeleteFile(ctx.uid, 'DELETE', ctx);
    setStoredFiles(prev => prev.filter(f => f.uid !== ctx.uid));
    alert('刪除完成');
  };

  const canRequestDeleteFile = (file: StoredFile) => {
    if (superAdmin) return true;
    const uploaderId = String(file.uploaderId || '').trim();
    const currentUserId = String(authIdentity.userId || '').trim();
    if (uploaderId && currentUserId) return uploaderId === currentUserId;
    const uploaderName = String(file.uploaderName || '').trim().toLowerCase();
    const currentUserName = String(authIdentity.userName || '').trim().toLowerCase();
    if (uploaderName && currentUserName) return uploaderName === currentUserName;
    return false;
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

  const handleDownloadStoredFile = (f: StoredFile) => {
    if (!f.downloadUrl) {
      alert('下載連結不存在，請重新上傳後再試');
      return;
    }
    downloadManagedFile(f.downloadUrl, f.name).catch((err: any) => {
      alert(`下載失敗：${normalizeErrorMessage(err, '未知錯誤')}`);
    });
  };

  const handleOpenCreate = () => {
    setFormData({ ...initialForm, labour_status: '辦證中' });
    setEmployerQuery('');
    setApprovalQuery('');
    setEmployerDropdownOpen(false);
    setApprovalDropdownOpen(false);
    setProfile({
      labour_company_id: undefined,
      labour_company_name: undefined,
      work_experiences: [emptyExperience()],
      educations: [emptyEducation()],
      entry_refused: false,
      marital_status: 'single',
      phone_code: '+852',
      phone_number: '',
      quota_seq: '',
      work_locations: [],
      arrival_date: '',
      departure_date: '',
      work_batches: [],
      files: emptyFiles(),
    });
    setIsEditing(false);
    setSelectedId(null);
    setPinyinTouched(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (worker: Worker) => {
    setFormData({
      labour_name: worker.labour_name || '',
      id_card_number: worker.id_card_number || '',
      labour_status: labourStatusToUi(worker.labour_status),
      contract_salary: worker.contract_salary || '',
      employment_term: parseEmploymentMonths(worker.employment_term),
      employer_id: worker.employer_id,
      approval_id: (worker as any).approval_id,
    });

    const p = getWorkerProfile(worker.id);
    const rawContact = String((worker as any).contact_phone ?? p.contact_phone ?? '').trim();
    const inferredCode =
      rawContact.startsWith('+86') ? '+86'
        : rawContact.startsWith('+853') ? '+853'
          : rawContact.startsWith('+852') ? '+852'
            : '+852';
    const inferredNumber = rawContact.replace(/^\+\d{2,3}/, '').trim();
    const merged: WorkerProfile = {
      labour_company_id: (worker as any).labour_company_id ?? p.labour_company_id,
      labour_company_name: (worker as any).labour_company_name ?? p.labour_company_name,
      approval_id: (worker as any).approval_id ?? p.approval_id,
      approval_number: (worker as any).approval_number ?? p.approval_number,
      quota_seq: (worker as any).quota_seq ?? p.quota_seq,
      pinyin_name: (worker as any).pinyin_name ?? p.pinyin_name,
      contact_phone: (worker as any).contact_phone ?? p.contact_phone,
      phone_code: (p.phone_code as any) || inferredCode,
      phone_number: p.phone_number || inferredNumber,
      residential_address: (worker as any).residential_address ?? p.residential_address,
      mailing_address: (worker as any).mailing_address ?? p.mailing_address,
      work_locations: Array.isArray((worker as any).work_locations)
        ? (worker as any).work_locations
        : Array.isArray(p.work_locations)
          ? p.work_locations
          : [],
      marital_status: ((worker as any).marital_status ?? p.marital_status ?? 'single') as any,
      entry_refused: Boolean((worker as any).entry_refused ?? p.entry_refused),
      entry_refused_date: (worker as any).entry_refused_date ?? p.entry_refused_date,
      entry_refused_reason: (worker as any).entry_refused_reason ?? p.entry_refused_reason,
      work_experiences: Array.isArray((worker as any).work_experiences)
        ? (worker as any).work_experiences
        : Array.isArray(p.work_experiences)
          ? p.work_experiences
          : [emptyExperience()],
      educations: Array.isArray((worker as any).educations)
        ? (worker as any).educations
        : Array.isArray(p.educations)
          ? p.educations
          : [emptyEducation()],
      files: p.files || emptyFiles(),
      arrival_date: (worker as any).arrival_date ?? p.arrival_date ?? '',
      departure_date: (worker as any).departure_date ?? p.departure_date ?? '',
      work_batches: Array.isArray(p.work_batches) ? p.work_batches : [],
    };
    const workerEmployerId = Number(worker.employer_id || 0) || undefined;
    const candidateApprovalId = Number((merged as any).approval_id || 0) || undefined;
    const matchedApproval = candidateApprovalId
      ? approvals.find((a) => Number((a as any).id || 0) === Number(candidateApprovalId))
      : undefined;
    const approvalBelongsToEmployer = matchedApproval
      ? resolveApprovalEmployerId(matchedApproval) === Number(workerEmployerId || 0)
      : false;
    let sanitizedProfile: WorkerProfile = { ...merged };
    if (!approvalBelongsToEmployer) {
      sanitizedProfile = {
        ...sanitizedProfile,
        approval_id: undefined,
        approval_number: undefined,
        quota_seq: '',
        work_locations: [],
      };
    } else {
      const seq = String(sanitizedProfile.quota_seq || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
      const details = getApprovalQuotaDetails(Number(candidateApprovalId));
      const matchedQuota = details.find((q) => String(q.quota_seq || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4) === seq);
      if (!matchedQuota) {
        sanitizedProfile = {
          ...sanitizedProfile,
          quota_seq: '',
          work_locations: [],
        };
      } else {
        const locations = (Array.isArray((matchedQuota as any).work_locations)
          ? (matchedQuota as any).work_locations
          : [String((matchedQuota as any).work_location || '')]
        )
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 3);
        sanitizedProfile = {
          ...sanitizedProfile,
          quota_seq: seq,
          work_locations: locations,
        };
      }
    }
    setProfile(sanitizedProfile);
    setWorkerProfile(worker.id, sanitizedProfile);
    setFormData((prev) => ({
      ...prev,
      approval_id: sanitizedProfile.approval_id,
      employer_id: workerEmployerId,
    }));

    const employer = employers.find(e => e.id === Number(worker.employer_id));
    setEmployerQuery(employer ? employer.name : worker.employer_name || '');
    const approvalNumber = (worker as any).approval_number || sanitizedProfile.approval_number;
    setApprovalQuery(approvalNumber ? String(approvalNumber) : '');

    setIsEditing(true);
    setSelectedId(worker.id);
    setPinyinTouched(false);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (worker: Worker) => {
    setDeleteTarget(worker);
    setDeleteReason('');
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (!superAdmin) {
      const reason = String(deleteReason || '').trim();
      if (!reason) {
        alert('請填寫刪除理由');
        return;
      }
      setSaving(true);
      try {
        const resp = submitEntityDeleteRequest({
          module: 'workers',
          entityId: deleteTarget.id,
          recordNo: deleteTarget.labour_name || '',
          companyName: deleteTarget.employer_name || '',
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
    setSaving(true);
    const targetId = deleteTarget.id;
    const prev = workers;
    setWorkers(prev.filter(w => w.id !== targetId));
    try {
      await deleteWorker(targetId);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteReason('');
      fetchWorkers('', false, true);
    } catch {
      setWorkers(prev);
      alert('刪除失敗，已復原列表');
    } finally {
      setSaving(false);
    }
  };

  const formatApiError = (err: any) => {
    const status = err?.response?.status as number | undefined;
    const data = err?.response?.data;
    const detail = data?.detail;
    if (typeof detail === 'string') return status ? `HTTP ${status}：${detail}` : detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const loc = Array.isArray(first?.loc) ? first.loc.join('.') : '';
      const msg = first?.msg ? String(first.msg) : '';
      const text = [loc, msg].filter(Boolean).join('：') || JSON.stringify(detail);
      return status ? `HTTP ${status}：${text}` : text;
    }
    if (data?.message) return status ? `HTTP ${status}：${String(data.message)}` : String(data.message);
    if (err?.message) return status ? `HTTP ${status}：${String(err.message)}` : String(err.message);
    if (data) {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      return status ? `HTTP ${status}：${text}` : text;
    }
    return status ? `HTTP ${status}` : '操作失敗';
  };

  const retryWithoutExtras = async (id: number | null, labourName: string, idCard: string) => {
    const minimal: WorkerCreate = {
      labour_name: labourName,
      id_card_number: idCard,
      labour_status: labourStatusToApi(String(formData.labour_status || '辦證中')),
      contract_salary: String(formData.contract_salary || '').trim(),
      employment_term: formatEmploymentMonths(formData.employment_term),
      employer_id: employerId,
    };
    if (id) return updateWorker(id, minimal);
    return createWorker(minimal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationMessage = validateWorkerSubmitInput({
      formData,
      profile,
      isEditing,
      employerId,
      approvalId,
      selectedQuotaSeq,
      quotaOptionsLength: quotaOptions.length,
    });
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    setSaving(true);
    try {
      const { labourName, idCard, persistedProfile, fullPayload } = buildWorkerSubmitPayload({
        formData,
        profile,
        employerId,
        approvalId,
        selectedQuotaSeq,
        employerQuery,
        employers,
      });

      if (isEditing && selectedId) {
        try {
          await updateWorker(selectedId, fullPayload);
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;
          const text = JSON.stringify(err?.response?.data || {}).toLowerCase();
          if (status === 422 && (text.includes('extra') || text.includes('not permitted') || text.includes('unexpected'))) {
            await retryWithoutExtras(selectedId, labourName, idCard);
            alert('後端暫未支援部分擴展欄位；已改為只保存核心資料，其他欄位將保存在本機。');
          } else {
            throw err;
          }
        }
        setWorkerProfile(selectedId, persistedProfile);
      } else {
        try {
          const created = await createWorker(fullPayload);
          if (created?.id) setWorkerProfile(Number(created.id), persistedProfile);
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;
          const text = JSON.stringify(err?.response?.data || {}).toLowerCase();
          if (status === 422 && (text.includes('extra') || text.includes('not permitted') || text.includes('unexpected'))) {
            const created = await retryWithoutExtras(null, labourName, idCard);
            if ((created as any)?.id) setWorkerProfile(Number((created as any).id), persistedProfile);
            alert('後端暫未支援部分擴展欄位；已改為只保存核心資料，其他欄位將保存在本機。');
          } else {
            throw err;
          }
        }
      }

      setIsModalOpen(false);
      fetchWorkers('', false, true);
    } catch (err: any) {
      alert(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">勞工管理</h1>
          <p className="text-gray-500 mt-1">管理所有外籍勞工資料與狀態</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增勞工</span>
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
              placeholder="搜尋勞工姓名、證件號碼..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <button onClick={() => fetchWorkers(search, false, true)} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
            <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
          </button>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">中文名字</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">證件號碼</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬僱主</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批文</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">勞工狀態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && workers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                    <p className="text-gray-500 mt-2">載入中...</p>
                  </td>
                </tr>
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {error ? '後端勞工服務暫時不可用，請稍後再刷新' : hasLoaded ? '找不到符合條件的勞工' : '尚未載入勞工資料，請點右側刷新按鈕取得列表'}
                  </td>
                </tr>
              ) : (
                workers.slice(0, renderCount).map((worker) => {
                  const cachedProfile = getWorkerProfile(worker.id);
                  const approvalNumber = (worker as any).approval_number || cachedProfile.approval_number || '-';
                  const employerName = worker.employer_name || employers.find(e => e.id === Number(worker.employer_id))?.name || '-';

                  return (
                    <tr key={worker.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center text-green-600 font-medium border border-green-200 shrink-0">
                            {worker.labour_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{worker.labour_name || '未命名'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{(worker as any).pinyin_name || cachedProfile.pinyin_name || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{worker.id_card_number || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[240px] truncate" title={employerName}>{employerName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{String(approvalNumber).toUpperCase()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={clsx(
                            'px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full',
                            labourStatusToUi(worker.labour_status) === '在職'
                              ? 'bg-green-100 text-green-800'
                              : labourStatusToUi(worker.labour_status) === '辦證中'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {labourStatusToUi(worker.labour_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => openWorkerFiles(worker)}
                          className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors mr-2"
                          title="存檔"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(worker)}
                          className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(worker)}
                          className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors ml-2"
                          title="刪除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && workers.length > renderCount && (
          <div className="px-4 py-3 border-t border-gray-100 bg-white/70 text-center">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50"
              onClick={() => setRenderCount((n) => n + 120)}
            >
              載入更多（{workers.length - renderCount}）
            </button>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? '編輯勞工資料' : '新增勞工'}
        className="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-1 ml-1">
                <label className="block text-sm font-medium text-gray-700">中文名字 *</label>
                <span className="text-xs text-gray-500">必填</span>
              </div>
              <input
                type="text"
                value={formData.labour_name}
                onChange={(e) => {
                  const labourName = e.target.value;
                  setFormData({ ...formData, labour_name: labourName });
                  if (pinyinTouched) return;
                  const generated = toWorkerNamePinyin(labourName);
                  setProfile((prev) => ({ ...prev, pinyin_name: generated }));
                }}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 ml-1">
                <label className="block text-sm font-medium text-gray-700">內地身份證號碼 *</label>
                <span className="text-xs text-gray-500">18 位</span>
              </div>
              <input
                type="text"
                value={formData.id_card_number}
                onChange={(e) => setFormData({ ...formData, id_card_number: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">拼音名字</label>
              <input
                type="text"
                value={profile.pinyin_name || ''}
                onChange={(e) => {
                  setPinyinTouched(true);
                  setProfile(prev => ({ ...prev, pinyin_name: e.target.value }));
                }}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：ZHANG SAN"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">聯繫電話</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="w-32 sm:w-36">
                  <select
                    value={profile.phone_code || '+852'}
                    onChange={(e) => setProfile(prev => ({ ...prev, phone_code: e.target.value as any }))}
                    className={clsx(
                      "w-full px-3 py-2 bg-white border rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all",
                      profile.phone_number && !isPhoneNumber(profile.phone_number) ? 'border-red-300' : 'border-gray-200'
                    )}
                  >
                    {PHONE_CODES.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={profile.phone_number || ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setProfile(prev => ({ ...prev, phone_number: v }));
                  }}
                  className={clsx(
                    "flex-1 min-w-[220px] px-4 py-2 bg-white border rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all",
                    profile.phone_number && !isPhoneNumber(profile.phone_number) ? 'border-red-300' : 'border-gray-200'
                  )}
                  placeholder="電話號碼（7-11位數字）"
                />
              </div>
              {profile.phone_number && !isPhoneNumber(profile.phone_number) && (
                <p className="text-xs text-red-500 mt-1 ml-1">請輸入 7-11 位數字</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">婚姻狀況</label>
              <select
                value={profile.marital_status || 'single'}
                onChange={(e) => setProfile(prev => ({ ...prev, marital_status: e.target.value as any }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                <option value="single">未婚</option>
                <option value="married">已婚</option>
                <option value="divorced">離異</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">勞工狀態</label>
              <select
                value={formData.labour_status}
                onChange={(e) => setFormData({ ...formData, labour_status: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                disabled={!isEditing}
              >
                {labourStatusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {!isEditing && (
                <p className="text-xs text-gray-500 mt-1 ml-1">首次錄入固定為「辦證中」</p>
              )}
            </div>

            {String(formData.labour_status || '辦證中') === '在職' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">赴港日期 *</label>
                <input
                  type="date"
                  value={normalizeDate(profile.arrival_date || '')}
                  onChange={(e) => setProfile(prev => ({ ...prev, arrival_date: e.target.value }))}
                  className={clsx(
                    'w-full px-4 py-2 bg-white border rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all',
                    !String(profile.arrival_date || '').trim() ? 'border-red-300' : 'border-gray-200'
                  )}
                  required
                />
              </div>
            )}

            {String(formData.labour_status || '辦證中') === '離職' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">離港日期 *</label>
                <input
                  type="date"
                  value={normalizeDate(profile.departure_date || '')}
                  onChange={(e) => setProfile(prev => ({ ...prev, departure_date: e.target.value }))}
                  className={clsx(
                    'w-full px-4 py-2 bg-white border rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all',
                    !String(profile.departure_date || '').trim() ? 'border-red-300' : 'border-gray-200'
                  )}
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">居住地址</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Home className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={profile.residential_address || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, residential_address: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">通訊地址</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={profile.mailing_address || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, mailing_address: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 ml-1">
                <Link2 className="w-4 h-4 text-gray-400" />
                <span>關聯</span>
              </div>
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
                        setApprovalDropdownOpen(false);
                        setFormData(prev => ({ ...prev, employer_id: undefined, approval_id: undefined }));
                        setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: undefined, quota_seq: '', work_locations: [] }));
                        setApprovalQuery('');
                      }}
                      onFocus={() => {
                        if (employerBlurTimer.current) window.clearTimeout(employerBlurTimer.current);
                        setEmployerDropdownOpen(true);
                      }}
                      onBlur={() => {
                        employerBlurTimer.current = window.setTimeout(() => setEmployerDropdownOpen(false), 150);
                      }}
                      placeholder="輸入僱主代碼或名稱..."
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
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
                                setFormData(prev => ({ ...prev, employer_id: e.id, approval_id: undefined }));
                                setEmployerQuery(employerLabel(e));
                                setEmployerDropdownOpen(false);
                                setApprovalQuery('');
                                setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: undefined, quota_seq: '', work_locations: [] }));
                              }}
                            >
                              <div className="text-sm font-medium text-gray-900">{employerLabel(e)}</div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">批文 *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={approvalQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setApprovalQuery(v);
                        setApprovalDropdownOpen(true);
                        setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: v, quota_seq: '', work_locations: [] }));
                        setFormData(prev => ({ ...prev, approval_id: undefined }));
                      }}
                      onFocus={() => {
                        if (approvalBlurTimer.current) window.clearTimeout(approvalBlurTimer.current);
                        setApprovalDropdownOpen(true);
                      }}
                      onBlur={() => {
                        approvalBlurTimer.current = window.setTimeout(() => setApprovalDropdownOpen(false), 150);
                      }}
                      placeholder={employerId ? '輸入批文編號...' : '請先選擇僱主'}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all disabled:opacity-60"
                      disabled={!employerId}
                      required
                    />
                    {approvalDropdownOpen && employerId && (
                      <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-apple-sm shadow-lg overflow-hidden">
                        {filteredApprovals.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">找不到符合條件的批文</div>
                        ) : (
                          filteredApprovals.map(a => (
                            <button
                              key={(a as any).id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                              onMouseDown={(evt) => evt.preventDefault()}
                              onClick={() => {
                                setProfile(prev => ({ ...prev, approval_id: (a as any).id, approval_number: a.approval_number, quota_seq: '', work_locations: [] }));
                                setFormData(prev => ({ ...prev, approval_id: (a as any).id }));
                                setApprovalQuery(approvalLabel(a));
                                setApprovalDropdownOpen(false);
                              }}
                            >
                              <div className="text-sm font-medium text-gray-900">{approvalLabel(a)}</div>
                              {(a.department || a.signatory_name) && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {a.department || ''}{a.department && a.signatory_name ? ' · ' : ''}{a.signatory_name || ''}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">配額編號 *</label>
                  <select
                    value={selectedQuotaSeq}
                    onChange={(e) => applyQuotaToWorkerForm(e.target.value)}
                    disabled={!approvalId || quotaOptions.length === 0}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all disabled:opacity-60"
                    required
                  >
                    <option value="">{!approvalId ? '請先選擇批文' : quotaOptions.length === 0 ? '此批文未設定配額' : '請選擇配額編號'}</option>
                    {quotaOptions.map(opt => (
                      <option key={opt.seq} value={opt.seq}>{opt.seq}</option>
                    ))}
                  </select>
                  {selectedQuotaDetail && (
                    <p className="text-xs text-gray-500 mt-1 ml-1">
                      已套入：{selectedQuotaDetail.job_title || '-'} · 工資 {selectedQuotaDetail.monthly_salary ?? '-'} · {selectedQuotaDetail.employment_months ?? '-'} 個月
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">所屬勞務公司</label>
                  <select
                    value={String(profile.labour_company_id || '')}
                    onChange={(e) => {
                      const selected = labourCompanies.find((x) => x.id === e.target.value);
                      setProfile((prev) => ({
                        ...prev,
                        labour_company_id: selected?.id || undefined,
                        labour_company_name: selected?.company_name || undefined,
                      }));
                    }}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  >
                    <option value="">請選擇所屬勞務公司</option>
                    {labourCompanies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.company_name}（{item.company_code}）
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1 ml-1">資料來源：系統設定 → 勞務公司管理</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合約薪資</label>
              <input
                type="text"
                value={formData.contract_salary}
                onChange={(e) => setFormData({ ...formData, contract_salary: e.target.value.replace(/[^\d.]/g, '') })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：18000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱傭期限（月）</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(formData.employment_term || '')}
                  onChange={(e) => setFormData({ ...formData, employment_term: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  className="w-full px-4 py-2 pr-16 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  placeholder="例如：24"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">個月</span>
              </div>
              {formData.employment_term && (
                <p className="text-xs text-gray-500 mt-1 ml-1">將儲存為：{formatEmploymentMonths(formData.employment_term)}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">工作地址（最多3個，自動套入）</label>
              {(profile.work_locations || []).length === 0 ? (
                <div className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-apple-sm text-sm text-gray-500">
                  選擇配額編號後自動帶入
                </div>
              ) : (
                <div className="space-y-2">
                  {(profile.work_locations || []).slice(0, 3).map((addr, idx) => (
                    <input
                      key={`${idx}-${addr}`}
                      type="text"
                      value={addr}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-apple-sm text-sm text-gray-700"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white/50 border border-gray-200/50 rounded-apple-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <Briefcase className="w-4 h-4 text-gray-500" />
                  <span>工作履歷</span>
                </div>
                <button type="button" onClick={addExperience} className="text-sm text-apple-blue hover:text-blue-700">
                  + 新增
                </button>
              </div>
              <div className="space-y-4">
                {(profile.work_experiences || []).map((x, idx) => (
                  <div key={idx} className="rounded-apple-sm border border-gray-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-4">
                      <input
                        type="text"
                        value={x.company_name}
                        onChange={(e) =>
                          setProfile(prev => {
                            const next = [...(prev.work_experiences || [])];
                            next[idx] = { ...next[idx], company_name: e.target.value };
                            return { ...prev, work_experiences: next };
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                        placeholder="公司名稱"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="min-w-[240px]">
                          <label className="block text-xs text-gray-500 mb-1">入職時間</label>
                          <input
                            type="date"
                            value={normalizeDate(x.start_date)}
                            onChange={(e) =>
                              setProfile(prev => {
                                const next = [...(prev.work_experiences || [])];
                                next[idx] = { ...next[idx], start_date: e.target.value };
                                return { ...prev, work_experiences: next };
                              })
                            }
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                          />
                        </div>
                        <div className="min-w-[240px]">
                          <label className="block text-xs text-gray-500 mb-1">離職時間</label>
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={normalizeDate(x.end_date)}
                              onChange={(e) =>
                                setProfile(prev => {
                                  const next = [...(prev.work_experiences || [])];
                                  next[idx] = { ...next[idx], end_date: e.target.value };
                                  return { ...prev, work_experiences: next };
                                })
                              }
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setProfile(prev => {
                                  const list = [...(prev.work_experiences || [])];
                                  const next = list.filter((_, i) => i !== idx);
                                  return { ...prev, work_experiences: next.length > 0 ? next : [emptyExperience()] };
                                })
                              }
                              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-apple-sm text-sm text-gray-700"
                              title="刪除"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/50 border border-gray-200/50 rounded-apple-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <GraduationCap className="w-4 h-4 text-gray-500" />
                  <span>學歷證明</span>
                </div>
                <button type="button" onClick={addEducation} className="text-sm text-apple-blue hover:text-blue-700">
                  + 新增
                </button>
              </div>
              <div className="space-y-4">
                {(profile.educations || []).map((x, idx) => (
                  <div key={idx} className="rounded-apple-sm border border-gray-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-4">
                      <input
                        type="text"
                        value={x.school_name}
                        onChange={(e) =>
                          setProfile(prev => {
                            const next = [...(prev.educations || [])];
                            next[idx] = { ...next[idx], school_name: e.target.value };
                            return { ...prev, educations: next };
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                        placeholder="學校名稱"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="min-w-[240px]">
                          <label className="block text-xs text-gray-500 mb-1">入讀時間</label>
                          <input
                            type="date"
                            value={normalizeDate(x.start_date)}
                            onChange={(e) =>
                              setProfile(prev => {
                                const next = [...(prev.educations || [])];
                                next[idx] = { ...next[idx], start_date: e.target.value };
                                return { ...prev, educations: next };
                              })
                            }
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                          />
                        </div>
                        <div className="min-w-[240px]">
                          <label className="block text-xs text-gray-500 mb-1">畢業時間</label>
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={normalizeDate(x.graduation_date)}
                              onChange={(e) =>
                                setProfile(prev => {
                                  const next = [...(prev.educations || [])];
                                  next[idx] = { ...next[idx], graduation_date: e.target.value };
                                  return { ...prev, educations: next };
                                })
                              }
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setProfile(prev => {
                                  const list = [...(prev.educations || [])];
                                  const next = list.filter((_, i) => i !== idx);
                                  return { ...prev, educations: next.length > 0 ? next : [emptyEducation()] };
                                })
                              }
                              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-apple-sm text-sm text-gray-700"
                              title="刪除"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white/50 border border-gray-200/50 rounded-apple-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <Link2 className="w-4 h-4 text-gray-500" />
                <span>入境被拒</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="entry_refused"
                    checked={!profile.entry_refused}
                    onChange={() => setProfile(prev => ({ ...prev, entry_refused: false }))}
                  />
                  <span>沒有</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="entry_refused"
                    checked={Boolean(profile.entry_refused)}
                    onChange={() => setProfile(prev => ({ ...prev, entry_refused: true }))}
                  />
                  <span>有</span>
                </label>
              </div>
            </div>
            {profile.entry_refused && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">日期</label>
                  <input
                    type="date"
                    value={normalizeDate(profile.entry_refused_date || '')}
                    onChange={(e) => setProfile(prev => ({ ...prev, entry_refused_date: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">原因</label>
                  <input
                    type="text"
                    value={profile.entry_refused_reason || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, entry_refused_reason: e.target.value }))}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          {isEditing && (
            <div className="bg-white/50 border border-gray-200/50 rounded-apple-sm p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-3">
                <Briefcase className="w-4 h-4 text-gray-500" />
                <span>在港工作歷程</span>
              </div>
              {(profile.work_batches || []).length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-apple-sm p-3">
                  尚未產生歷程記錄。當狀態切換為「在職／離職」並儲存後，系統會自動追加批次資料。
                </div>
              ) : (
                <div className="space-y-2">
                  {(profile.work_batches || []).map((b) => (
                    <div key={b.id} className="rounded-apple-sm border border-gray-200 bg-white p-3">
                      <div className="text-sm font-medium text-gray-900">
                        {b.employer_name || '未指定僱主'} · {b.approval_number || '未指定批文'} · {b.status}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        開始：{b.start_date || '-'} ｜ 離港：{b.departure_date || '-'} ｜ 期限：{b.employment_term_months ? `${b.employment_term_months}個月` : '-'} ｜ 到期：{b.expires_at || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-50/60 border border-blue-100 rounded-apple-sm p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
              <FolderOpen className="w-4 h-4" />
              <span>文件上傳說明</span>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              勞工建立完成後，可於列表「存檔」按鈕進入文件空間，支援批次、拖曳上傳與進度顯示。
            </p>
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

      <Modal
        isOpen={isFileModalOpen}
        onClose={() => {
          clearScope(uploadScope);
          setIsFileModalOpen(false);
        }}
        title={`存檔空間 - ${selectedWorkerForFiles?.labour_name || ''}`}
        className="max-w-4xl"
      >
        <div className="flex h-[500px] -mx-6 -mb-6 border-t border-gray-200">
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-4 space-y-2 shrink-0">
            {FILE_FOLDERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFolder(f)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-apple-sm text-sm font-medium transition-colors flex items-center space-x-2',
                  activeFolder === f ? 'bg-apple-blue text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
                )}
              >
                <FolderOpen className={clsx('w-4 h-4', activeFolder === f ? 'text-white' : 'text-gray-400')} />
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
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleUploadFromInput}
                />
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center space-x-2 bg-white border border-apple-blue text-apple-blue hover:bg-blue-50 px-3 py-1.5 rounded-apple-sm transition-colors text-sm font-medium"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>上傳檔案</span>
                </button>
              </div>
            </div>

            <div
              className={clsx(
                'mx-4 mt-3 rounded-apple-sm border-2 border-dashed p-4 text-sm text-center transition-colors',
                dragOver ? 'border-apple-blue bg-blue-50' : 'border-gray-200 bg-gray-50/40'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDropUpload}
            >
              拖曳檔案到此處即可上傳（支援批次）
            </div>

            {uploadTasks.length > 0 && (
              <div className="px-4 pt-3 space-y-2">
                {uploadTasks.map((task) => (
                  <div key={task.key}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span className="truncate max-w-[70%]">{task.name}</span>
                      <span>{Math.round(task.percent)}%{task.remainingSeconds && task.remainingSeconds > 0 ? ` · 剩餘 ${task.remainingSeconds} 秒` : ''}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-2 bg-apple-blue" style={{ width: `${task.percent}%` }} />
                    </div>
                    {task.error && (
                      <div className="p-2 mt-1 rounded border border-red-200 bg-red-50 text-xs text-red-700 flex items-center justify-between">
                        <span className="truncate max-w-[75%]">{task.error}</span>
                        {task.retryFile && (
                          <button
                            type="button"
                            className="px-2 py-0.5 rounded bg-red-100 hover:bg-red-200"
                            onClick={() => {
                              if (!selectedWorkerForFiles) return;
                              processUploadFiles([task.retryFile!], folderToCategory(activeFolder), selectedWorkerForFiles.id);
                            }}
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

            <div className="flex-1 overflow-y-auto p-4">
              {storedFiles.filter(f => f.workerId === selectedWorkerForFiles?.id && f.folder === activeFolder).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                  <FolderOpen className="w-12 h-12 text-gray-300" />
                  <p>此資料夾目前沒有檔案</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {storedFiles
                    .filter(f => f.workerId === selectedWorkerForFiles?.id && f.folder === activeFolder)
                    .map(file => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-apple-sm hover:shadow-sm transition-shadow group">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="p-2 bg-blue-50 text-apple-blue rounded-apple-sm shrink-0">
                            <FolderOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB • {file.uploadTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDownloadStoredFile(file)}
                            className="p-1.5 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-md transition-colors"
                            title="下載"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {superAdmin ? (
                            <button
                              onClick={() => handleDeleteStoredFile(file.id, file.uid)}
                              className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              title="刪除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteStoredFile(file.id, file.uid)}
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

      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">系統提示</h3>
            <p className="text-gray-200 text-base mb-8 leading-relaxed">
              {superAdmin
                ? `確定要刪除勞工「${deleteTarget.labour_name || '未命名'}」嗎？刪除後不可復原。`
                : `確定要申請刪除勞工「${deleteTarget.labour_name || '未命名'}」嗎？需經超級管理員審批後才會正式刪除。`}
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
                onClick={confirmDelete}
                disabled={saving}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-apple-blue text-white hover:bg-blue-600 transition-colors flex items-center"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {superAdmin ? '確認' : '提交刪除申請'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workers;
