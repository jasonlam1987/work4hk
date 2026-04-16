import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw, UploadCloud, Trash2, FolderOpen, Download, FileText } from 'lucide-react';
import { Employer, getEmployers, createEmployer, updateEmployer, EmployerCreate, deleteEmployer } from '../api/employers';
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

interface StoredFile {
  id: string;
  uid: string;
  employerId: number;
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

const FOLDERS = ['企業資料', '申請文件', '外勞批文'];

const initialForm: EmployerCreate = {
  name: '',
  english_name: '',
  code: '',
  short_name: '',
  company_address: '',
  mailing_address: '',
  business_registration_number: '',
  business_type: '',
  remarks: ''
};

const EMPLOYERS_CACHE_KEY = 'cache_employers_list_v1';

const Employers: React.FC = () => {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EmployerCreate>(initialForm);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Modal states
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedEmployerForFiles, setSelectedEmployerForFiles] = useState<Employer | null>(null);
  
  // Custom Delete Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{id: number, name: string} | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteContext, setDeleteContext] = useState<DeleteContext | null>(null);
  const [deleteStatusByUid, setDeleteStatusByUid] = useState<Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'>>({});
  const superAdmin = isSuperAdmin();
  const authIdentity = getAuthIdentity();

  const [activeFolder, setActiveFolder] = useState<string>(FOLDERS[0]);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const fileFolderCacheRef = useRef<Record<string, StoredFile[]>>({});
  const optimisticPendingUntilRef = useRef<Record<string, number>>({});
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadScope = `employers:${selectedEmployerForFiles?.id || 0}:${activeFolder}`;
  const tasksByScope = useUploadStore(s => s.tasksByScope);
  const beginTask = useUploadStore(s => s.beginTask);
  const updateTask = useUploadStore(s => s.updateTask);
  const failTask = useUploadStore(s => s.failTask);
  const succeedTask = useUploadStore(s => s.succeedTask);
  const clearScope = useUploadStore(s => s.clearScope);
  const uploadTasks = React.useMemo(
    () => Object.values(tasksByScope[uploadScope] || {}),
    [tasksByScope, uploadScope]
  );

  useEffect(() => {
    const files = localStorage.getItem('mock_employer_files');
    if (files) {
      setStoredFiles(JSON.parse(files));
    }
  }, []);

  const mapManagedFiles = (ownerId: number, items: any[]): StoredFile[] =>
    items.map((it) => ({
      id: `${it.uid}`,
      uid: it.uid,
      employerId: ownerId,
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

  const folderCacheKey = (ownerId: number, folder: string) => `employers:${ownerId}:${folder}`;

  const loadFolderFiles = async (ownerId: number, folder: string, preferCache: boolean) => {
    const cacheKey = folderCacheKey(ownerId, folder);
    const cached = fileFolderCacheRef.current[cacheKey];
    if (preferCache && cached) {
      setStoredFiles(cached);
    }
    try {
      const items = await listManagedFiles('employers', ownerId, folder);
      const mapped = mapManagedFiles(ownerId, items);
      fileFolderCacheRef.current[cacheKey] = mapped;
      setStoredFiles(mapped);
    } catch {
    }
  };

  useEffect(() => {
    if (!isFileModalOpen || !selectedEmployerForFiles) return;
    loadFolderFiles(selectedEmployerForFiles.id, activeFolder, true);
  }, [isFileModalOpen, selectedEmployerForFiles, activeFolder]);

  useEffect(() => {
    if (!isFileModalOpen || !selectedEmployerForFiles || superAdmin) return;
    let canceled = false;
    const loadDeleteStatuses = async () => {
      try {
        const rows = await listDeleteRequests();
        if (canceled) return;
        const next: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'> = {};
        for (const row of rows) {
          if (String(row.module) !== 'employers') continue;
          if (Number(row.owner_id || 0) !== Number(selectedEmployerForFiles.id)) continue;
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
  }, [isFileModalOpen, selectedEmployerForFiles, superAdmin]);

  useEffect(() => {
    const raw = localStorage.getItem(EMPLOYERS_CACHE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.items) ? (parsed.items as Employer[]) : Array.isArray(parsed) ? (parsed as Employer[]) : [];
      if (items.length > 0) {
        setEmployers(items);
        setHasLoaded(true);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    if (hasLoaded || employers.length > 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setHasLoaded(true);
      fetchEmployers();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [employers.length, hasLoaded]);

  const handleOpenFiles = (employer: Employer) => {
    setSelectedEmployerForFiles(employer);
    setActiveFolder(FOLDERS[0]);
    setIsFileModalOpen(true);
    loadFolderFiles(employer.id, FOLDERS[0], true);
    // Warm up other folders so switching tabs feels instant.
    FOLDERS.slice(1).forEach((folder) => {
      loadFolderFiles(employer.id, folder, false);
    });
  };

  const doUpload = async (file: File) => {
    if (!selectedEmployerForFiles) return;
    if (file.size > MAX_UPLOAD_SIZE) {
      alert('檔案大小超過 10 MB，請壓縮後再上傳');
      return;
    }
    const key = `${file.name}-${file.size}-${Date.now()}`;
    beginTask(uploadScope, key, file.name, file);
    updateTask(uploadScope, key, { percent: 0, error: '', remainingSeconds: null });
    try {
      const saved = await uploadManagedFile({
        module: 'employers',
        owner_id: selectedEmployerForFiles.id,
        folder: activeFolder,
        file,
        retries: 1,
        onProgress: ({ percent, remainingSeconds }) => {
          updateTask(uploadScope, key, { percent, remainingSeconds });
        },
      });
      const newFile: StoredFile = {
        id: saved.uid,
        uid: saved.uid,
        employerId: selectedEmployerForFiles.id,
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
      const cacheKey = folderCacheKey(selectedEmployerForFiles.id, activeFolder);
      const nextFolderRows = [newFile, ...(fileFolderCacheRef.current[cacheKey] || [])];
      fileFolderCacheRef.current[cacheKey] = nextFolderRows;
      setStoredFiles(nextFolderRows);
      succeedTask(uploadScope, key);
      alert(`上傳成功：${saved.original_name}`);
    } catch (err: any) {
      const message = normalizeErrorMessage(err, '上傳失敗');
      failTask(uploadScope, key, message, file);
    }
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmployerForFiles) return;
    doUpload(file);

    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const handleDownloadFile = (file: StoredFile) => {
    if (!file.downloadUrl) return alert('下載連結不存在，請重新上傳');
    downloadManagedFile(file.downloadUrl, file.name).catch((err: any) => {
      alert(normalizeErrorMessage(err, '下載失敗'));
    });
  };

  const handleDeleteFile = (id: string) => {
    const target = storedFiles.find(f => f.id === id);
    if (!target?.uid) return;
    if (!superAdmin && !canRequestDeleteFile(target)) return;
    setDeleteContext({
      uid: target.uid,
      fileName: target.name,
      companyName: selectedEmployerForFiles?.name || '-',
      module: 'employers',
      ownerId: selectedEmployerForFiles?.id || 0,
      sectionName: activeFolder,
      folder: activeFolder,
      storedPath: target.storedPath || '',
      objectPath: target.objectPath || '',
      uploaderId: target.uploaderId || '',
      uploaderName: target.uploaderName || '',
    });
    setDeleteDialogOpen(true);
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

  const confirmPermanentDelete = async (ctx: DeleteContext) => {
    await permanentDeleteFile(ctx.uid, 'DELETE', ctx);
    const cacheKey = folderCacheKey(selectedEmployerForFiles?.id || 0, activeFolder);
    const nextRows = (fileFolderCacheRef.current[cacheKey] || storedFiles).filter(f => f.uid !== ctx.uid);
    fileFolderCacheRef.current[cacheKey] = nextRows;
    setStoredFiles(nextRows);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setFormData(prev => ({
      ...prev,
      name: '',
      english_name: '',
      business_registration_number: '',
      company_address: '',
      mailing_address: ''
    }));

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawDataUrl = String(reader.result || '');
        const imageDataUrl = await new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const encode = (canvas: HTMLCanvasElement, quality: number) => {
              try {
                return canvas.toDataURL('image/jpeg', quality);
              } catch {
                return rawDataUrl;
              }
            };

            const maxDim = 1200;
            const w = img.width;
            const h = img.height;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            const tw = Math.max(1, Math.round(w * scale));
            const th = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawDataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, tw, th);

            let out = encode(canvas, 0.75);
            if (out.length > 3_500_000) out = encode(canvas, 0.6);
            if (out.length > 3_500_000) out = encode(canvas, 0.5);
            resolve(out);
          };
          img.onerror = () => resolve(rawDataUrl);
          img.src = rawDataUrl;
        });

        if (imageDataUrl.length > 3_800_000) {
          alert('圖片檔案過大，可能導致線上辨識失敗。請裁切後重試，或換更小的圖片。');
          return;
        }
        const storedKeys = localStorage.getItem('system_api_keys');
        const tencentSecretId = storedKeys ? (() => {
          try {
            const parsed = JSON.parse(storedKeys);
            return parsed?.tencentSecretId ? String(parsed.tencentSecretId) : '';
          } catch {
            return '';
          }
        })() : '';
        const tencentSecretKey = storedKeys ? (() => {
          try {
            const parsed = JSON.parse(storedKeys);
            return parsed?.tencentSecretKey ? String(parsed.tencentSecretKey) : '';
          } catch {
            return '';
          }
        })() : '';
        const resp = await fetch('/api/ai/br-ocr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tencentSecretId ? { 'X-TENCENT-SECRET-ID': tencentSecretId } : {}),
            ...(tencentSecretKey ? { 'X-TENCENT-SECRET-KEY': tencentSecretKey } : {}),
          },
          body: JSON.stringify({ imageDataUrl }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          try {
            const parsed = text ? JSON.parse(text) : null;
            const status = parsed?.status ? String(parsed.status) : '';
            const errMsg = parsed?.error ? String(parsed.error) : '';
            const detailMsg = parsed?.detail ? String(parsed.detail) : '';
            const msg = [status ? `HTTP ${status}` : '', errMsg, detailMsg].filter(Boolean).join('：');
            const normalized = msg ? String(msg) : '';
            if (normalized.toLowerCase().includes('tencent ocr credentials') && normalized.toLowerCase().includes('not configured')) {
              alert('尚未啟用 OCR 圖像辨識：請到「系統設定 → API 金鑰管理」輸入 SecretId / SecretKey 並儲存。');
            } else {
              alert(normalized || (text || '辨識失敗'));
            }
          } catch {
            alert(text || '辨識失敗');
          }
          return;
        }
        const data = await resp.json();
        const name = typeof data?.name === 'string' ? data.name.trim() : '';
        const englishName = typeof data?.english_name === 'string' ? data.english_name.trim() : '';
        const brNo = typeof data?.business_registration_number === 'string' ? data.business_registration_number.trim() : '';
        const address = typeof data?.company_address === 'string' ? data.company_address.trim() : '';
        const businessType = typeof data?.business_type === 'string' ? data.business_type.trim() : '';
        const hasAny = Boolean(name || englishName || brNo || address || businessType);
        if (!hasAny) {
          alert('未能從圖片識別到可用的商業登記證資訊，請確認圖片清晰並重試。');
          return;
        }
        const missing: string[] = [];
        if (!name) missing.push('僱主名稱（中文）');
        if (!brNo) missing.push('商業登記號碼 (BR)');
        if (!address) missing.push('公司地址');
        if (missing.length > 0) {
          alert(`識別完成，但以下欄位未能識別：${missing.join('、')}。你可手動補充或換更清晰的圖片重試。`);
        }

        setFormData(prev => ({
          ...prev,
          name,
          english_name: englishName,
          business_registration_number: brNo,
          business_type: businessType,
          company_address: address,
          mailing_address: address
        }));
        if (missing.length === 0) {
          alert('商業登記證 (BR) 識別成功！已自動填入相關欄位。');
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('failed to fetch')) {
          alert('連線失敗：請確認目前是用「npm run dev」啟動網站，且網址/埠號正確（預設 http://localhost:5176/ ），再重試上傳。');
        } else {
          alert(msg || '辨識失敗');
        }
      } finally {
        setOcrLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.onerror = () => {
      setOcrLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      alert('讀取圖片失敗');
    };
    reader.readAsDataURL(file);
  };

  const fetchEmployers = async () => {
    try {
      setLoading(true);
      const data = await getEmployers({ limit: 1000 });
      setEmployers(data);
      localStorage.setItem(EMPLOYERS_CACHE_KEY, JSON.stringify({ items: data, savedAt: Date.now() }));
      setError('');
      setHasLoaded(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取僱主列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const visibleEmployers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter(e => {
      const hay = `${e.code || ''} ${e.name || ''} ${e.english_name || ''} ${e.business_registration_number || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [employers, search]);

  const handleOpenCreate = () => {
    // 找出目前的 EST 最大序號
    const estCodes = employers
      .map(e => e.code)
      .filter(c => c && c.startsWith('EST'))
      .map(c => parseInt(c.replace('EST', ''), 10))
      .filter(n => !isNaN(n));
      
    const maxCode = estCodes.length > 0 ? Math.max(...estCodes) : 0;
    const nextCodeStr = `EST${String(maxCode + 1).padStart(5, '0')}`;

    setFormData({
      ...initialForm,
      code: nextCodeStr
    });
    setIsEditing(false);
    setSelectedId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (employer: Employer) => {
    setFormData({ 
      name: employer.name,
      english_name: employer.english_name || '',
      code: employer.code || '',
      short_name: employer.short_name || '',
      company_address: employer.company_address || '',
      mailing_address: employer.mailing_address || '',
      business_registration_number: employer.business_registration_number || '',
      business_type: employer.business_type || '',
      remarks: employer.remarks || ''
    });
    setIsEditing(true);
    setSelectedId(employer.id);
    setIsModalOpen(true);
  };

  const persistEmployersCache = (items: Employer[]) => {
    setTimeout(() => {
      try {
        localStorage.setItem(EMPLOYERS_CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
      } catch {
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && selectedId) {
        const saved = await updateEmployer(selectedId, formData);
        setEmployers(prev => {
          const next = prev.map(it => (it.id === saved.id ? saved : it));
          persistEmployersCache(next);
          return next;
        });
      } else {
        const saved = await createEmployer(formData);
        setEmployers(prev => {
          const next = [saved, ...prev];
          persistEmployersCache(next);
          return next;
        });
      }
      sessionStorage.removeItem('dashboardStats');
      setIsModalOpen(false);
      setHasLoaded(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;
    const prevEmployers = employers;

    setEmployers(prev => {
      const next = prev.filter(e => e.id !== targetId);
      localStorage.setItem(EMPLOYERS_CACHE_KEY, JSON.stringify({ items: next, savedAt: Date.now() }));
      return next;
    });
    setDeleteModalOpen(false);
    setDeleteTarget(null);

    setSaving(true);
    try {
      await deleteEmployer(targetId);
      sessionStorage.removeItem('dashboardStats');
      setHasLoaded(true);
    } catch (err: any) {
      setEmployers(prevEmployers);
      persistEmployersCache(prevEmployers);
      alert(err.response?.data?.detail || '刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  const triggerDelete = (id: number, name: string) => {
    setDeleteTarget({ id, name });
    setDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">僱主管理</h1>
          <p className="text-gray-500 mt-1">管理所有合作僱主與公司資料</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleOpenCreate}
            className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>新增僱主</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 flex items-center justify-between bg-white/50">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="搜尋僱主名稱、代碼..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <button onClick={() => { setHasLoaded(true); fetchEmployers(); }} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">僱主名稱</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">代碼</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商業登記號</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">地址</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && employers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                    <p className="text-gray-500 mt-2">載入中...</p>
                  </td>
                </tr>
              ) : visibleEmployers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    {error
                      ? '後端僱主服務暫時不可用，請稍後再刷新'
                      : hasLoaded
                        ? '找不到符合條件的僱主'
                        : '尚未載入僱主資料，請點右側刷新按鈕取得列表'}
                  </td>
                </tr>
              ) : (
                visibleEmployers.map((employer) => (
                  <tr key={employer.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-purple-600 font-medium border border-purple-200 shrink-0">
                          {employer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{employer.name}</div>
                          <div className="text-sm text-gray-500">{employer.english_name || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employer.code || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employer.business_registration_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-[200px]" title={employer.company_address}>
                      {employer.company_address || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button 
                        onClick={() => handleOpenFiles(employer)}
                        className="text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 p-2 rounded-full transition-colors"
                        title="儲存空間"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenEdit(employer)}
                        className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.preventDefault(); 
                          e.stopPropagation(); 
                          triggerDelete(employer.id, employer.name); 
                        }}
                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors"
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

      {/* Employer Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "編輯僱主資料" : "新增僱主"}
        className="max-w-2xl"
      >
        {!isEditing && (
          <div className="mb-6 p-4 bg-blue-50/50 border border-blue-100 rounded-apple-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-blue-900">商業登記證 (BR) 自動辨識</h3>
              <p className="text-xs text-blue-700 mt-1">上傳圖片即可自動填寫法團名稱、分行、地址與 BR 號碼</p>
            </div>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              type="button"
              disabled={ocrLoading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 bg-white border border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-600 px-3 py-1.5 rounded-apple-sm transition-colors text-sm font-medium disabled:opacity-50"
            >
              {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              <span>{ocrLoading ? '辨識中...' : '上傳圖片'}</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱主名稱 (中文) *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">英文名稱</label>
              <input
                type="text"
                value={formData.english_name}
                onChange={(e) => setFormData({...formData, english_name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱主代碼 (系統編號)</label>
              <input
                type="text"
                value={formData.code}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-apple-sm text-gray-500 cursor-not-allowed transition-all"
                title="系統自動產生的編號，不可修改"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">商業登記號碼 (BR)</label>
              <input
                type="text"
                value={formData.business_registration_number}
                onChange={(e) => setFormData({...formData, business_registration_number: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">簡稱</label>
              <input
                type="text"
                value={formData.short_name}
                onChange={(e) => setFormData({...formData, short_name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">業務類型</label>
              <input
                type="text"
                value={formData.business_type}
                onChange={(e) => setFormData({...formData, business_type: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">公司地址</label>
              <input
                type="text"
                value={formData.company_address}
                onChange={(e) => setFormData({...formData, company_address: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">通訊地址</label>
              <input
                type="text"
                value={formData.mailing_address}
                onChange={(e) => setFormData({...formData, mailing_address: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">備註</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                rows={3}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all resize-none"
              />
            </div>
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
      
      {/* File Management Modal */}
      <Modal
        isOpen={isFileModalOpen}
        onClose={() => {
          clearScope(uploadScope);
          setIsFileModalOpen(false);
        }}
        title={`儲存空間 - ${selectedEmployerForFiles?.name}`}
        className="max-w-4xl"
      >
        <div className="flex h-[500px] -mx-6 -mb-6 border-t border-gray-200">
          {/* Sidebar */}
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-4 space-y-2 shrink-0">
            {FOLDERS.map(f => (
              <button
                key={f}
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

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-white">
            {/* Toolbar */}
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
                  onClick={() => uploadInputRef.current?.click()} 
                  className="flex items-center space-x-2 bg-white border border-apple-blue text-apple-blue hover:bg-blue-50 px-3 py-1.5 rounded-apple-sm transition-colors text-sm font-medium"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>上傳檔案</span>
                </button>
              </div>
            </div>

            {/* File List */}
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
              {storedFiles.filter(f => f.employerId === selectedEmployerForFiles?.id && f.folder === activeFolder).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                  <FolderOpen className="w-12 h-12 text-gray-300" />
                  <p>此資料夾目前沒有檔案</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {storedFiles
                    .filter(f => f.employerId === selectedEmployerForFiles?.id && f.folder === activeFolder)
                    .map(file => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-apple-sm hover:shadow-sm transition-shadow group">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="p-2 bg-blue-50 text-apple-blue rounded-apple-sm shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {(file.size / 1024).toFixed(1)} KB • {file.uploadTime}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleDownloadFile(file)}
                            className="p-1.5 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-md transition-colors"
                            title="下載"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {superAdmin ? (
                            <button 
                              onClick={() => handleDeleteFile(file.id)}
                              className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              title="刪除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
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

      {/* Custom Delete Confirmation Modal */}
      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">http://localhost:5176 顯示</h3>
            <p className="text-gray-200 text-base mb-8 leading-relaxed">
              確定要刪除僱主「{deleteTarget.name}」嗎？這將會同步刪除該僱主相關的職位與勞工數據，且無法復原。
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteTarget(null);
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
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employers;
