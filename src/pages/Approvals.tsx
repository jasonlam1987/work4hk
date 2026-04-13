import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw, Trash2, FolderOpen, UploadCloud, Download, FileText } from 'lucide-react';
import { Approval, getApprovals, createApproval, updateApproval, deleteApproval, ApprovalCreate } from '../api/approvals';
import { Employer, getEmployers } from '../api/employers';
import { Partner, getPartners } from '../api/settings';
import Modal from '../components/Modal';
import clsx from 'clsx';

interface StoredApprovalFile {
  id: string;
  approvalId: number;
  folder: string;
  name: string;
  size: number;
  uploadTime: string;
}

const APPROVAL_FOLDERS = ['批文文件', '申請文件', '其他'];

const initialForm: ApprovalCreate = {
  employer_id: undefined,
  partner_id: undefined,
  approval_number: '',
  department: '勞工處',
  headcount: 0,
  signatory_name: ''
};

const APPROVALS_CACHE_KEY = 'cache_approvals_list_v1';


const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ApprovalCreate>(initialForm);
  const [saving, setSaving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; approvalNumber: string } | null>(null);

  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedApprovalForFiles, setSelectedApprovalForFiles] = useState<Approval | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>(APPROVAL_FOLDERS[0]);
  const [storedFiles, setStoredFiles] = useState<StoredApprovalFile[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [employers, setEmployers] = useState<Employer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [employerQuery, setEmployerQuery] = useState('');
  const [partnerQuery, setPartnerQuery] = useState('');
  const [employerDropdownOpen, setEmployerDropdownOpen] = useState(false);
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const employerBlurTimer = useRef<number | null>(null);
  const partnerBlurTimer = useRef<number | null>(null);

  const filteredEmployers = useMemo(() => {
    const q = employerQuery.trim().toLowerCase();
    const list = q
      ? employers.filter(e => {
          const hay = `${e.code || ''} ${e.name || ''} ${e.english_name || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : employers;
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
    const v = String(value).trim();
    if (!v) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace(/-/g, '/');
    return v;
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

  const toApiDate = (value: string) => {
    const v = value.trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v.replace(/\//g, '-');
    return v;
  };

  const toDateInput = (value: string) => {
    const v = value.trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v.replace(/\//g, '-');
    return v;
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
    try {
      setLoading(true);
      const data = await getApprovals({ limit: 1000 });
      setApprovals(data);
      localStorage.setItem(APPROVALS_CACHE_KEY, JSON.stringify({ items: data, savedAt: Date.now() }));
      setError('');
      setHasLoaded(true);
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const data = err?.response?.data;

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
      const employerId = (a as any).employer_id ?? (a as any).employerId;
      const employerName = getEmployerDisplayById(employerId, a.employer_name);
      const hay = `${String(a.approval_number || '')} ${String(a.department || '')} ${String(employerName || '')} ${String(a.signatory_name || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [approvals, search, getEmployerDisplayById]);

  

  const handleOpenCreate = () => {
    setFormData(initialForm);
    setEmployerQuery('');
    setPartnerQuery('');
    setEmployerDropdownOpen(false);
    setPartnerDropdownOpen(false);
    ensureLookupsLoaded();
    setIsEditing(false);
    setSelectedId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (approval: Approval) => {
    const employerId = (approval as any).employer_id ?? (approval as any).employerId;
    const partnerId = (approval as any).partner_id ?? (approval as any).partnerId;

    setFormData({ 
      employer_id: employerId,
      partner_id: partnerId,
      approval_number: String(approval.approval_number || '').toUpperCase(),
      department: approval.department || '勞工處',
      headcount: approval.headcount || 0,
      signatory_name: approval.signatory_name || '',
      issue_date: (approval as any).issue_date ? toDateInput(String((approval as any).issue_date)) : '',
      valid_until: (approval as any).valid_until ? toDateInput(String((approval as any).valid_until)) : ''
    });
    setEmployerQuery(getEmployerDisplayById(employerId, approval.employer_name));
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
    setDeleteModalOpen(true);
  };

  const handleOpenFiles = (approval: Approval) => {
    setSelectedApprovalForFiles(approval);
    setActiveFolder(APPROVAL_FOLDERS[0]);
    setIsFileModalOpen(true);
  };

  const writeStoredFiles = (items: StoredApprovalFile[]) => {
    setStoredFiles(items);
    localStorage.setItem('mock_approval_files', JSON.stringify(items));
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedApprovalForFiles) return;

    const newFile: StoredApprovalFile = {
      id: Date.now().toString(),
      approvalId: selectedApprovalForFiles.id,
      folder: activeFolder,
      name: file.name,
      size: file.size,
      uploadTime: new Date().toLocaleString(),
    };

    writeStoredFiles([...storedFiles, newFile]);

    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const handleDownloadFile = (file: StoredApprovalFile) => {
    const approvalNo = String(selectedApprovalForFiles?.approval_number || '').toUpperCase();
    const blob = new Blob([
      `這是一個模擬下載的檔案。\n` +
        `批文編號：${approvalNo}\n` +
        `檔名：${file.name}\n` +
        `大小：${file.size} bytes\n` +
        `上傳時間：${file.uploadTime}\n` +
        `所屬資料夾：${file.folder}`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteFile = (id: string) => {
    if (!window.confirm('確定要刪除這個檔案嗎？刪除後無法回復。')) return;
    writeStoredFiles(storedFiles.filter(f => f.id !== id));
  };

  const cleanupApprovalFiles = (approvalId: number) => {
    const next = storedFiles.filter(f => f.approvalId !== approvalId);
    writeStoredFiles(next);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const prevApprovals = approvals;

    setApprovals(prev => {
      const next = prev.filter(a => a.id !== targetId);
      writeApprovalsCache(next);
      return next;
    });
    setDeleteModalOpen(false);
    setDeleteTarget(null);
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
    };

    if (formData.department && String(formData.department).trim()) payload.department = String(formData.department).trim();
    if (typeof formData.headcount === 'number' && formData.headcount > 0) payload.headcount = formData.headcount;
    if (formData.signatory_name && String(formData.signatory_name).trim()) payload.signatory_name = String(formData.signatory_name).trim();
    if (formData.issue_date && String(formData.issue_date).trim()) payload.issue_date = toApiDate(String(formData.issue_date));
    if (formData.valid_until && String(formData.valid_until).trim()) payload.valid_until = toApiDate(String(formData.valid_until));

    setSaving(true);
    try {
      const save = async (data: ApprovalCreate) => {
        if (isEditing && selectedId) {
          await updateApproval(selectedId, data);
        } else {
          await createApproval(data);
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
          <button onClick={fetchApprovals} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批文編號</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬僱主</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">簽署人</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配額數量</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">有效期限</th>
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
                    {hasLoaded ? '找不到符合條件的批文' : '尚未載入批文資料，請點右側刷新按鈕取得列表'}
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
                        title={getEmployerDisplayById((approval as any).employer_id ?? (approval as any).employerId, approval.employer_name)}
                      >
                        {getEmployerDisplayById((approval as any).employer_id ?? (approval as any).employerId, approval.employer_name)}
                      </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {approval.signatory_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-apple-dark">
                      {approval.headcount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateDisplay((approval as any).valid_until ?? (approval as any).validUntil)}
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

      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-apple w-full max-w-md p-6 shadow-xl border border-gray-800">
            <h3 className="text-white font-semibold text-sm mb-4">http://localhost:5176 顯示</h3>
            <p className="text-gray-200 text-base mb-8 leading-relaxed">
              確定要刪除批文「{deleteTarget.approvalNumber}」嗎？刪除後數據無法回復。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
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
                type="button"
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-5 py-2 rounded-apple-sm text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
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
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="刪除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

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
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">批文編號 *</label>
              <input
                type="text"
                value={String(formData.approval_number || '').toUpperCase()}
                onChange={(e) => setFormData({...formData, approval_number: e.target.value.toUpperCase()})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">發證部門</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">配額數量</label>
              <input
                type="number"
                value={formData.headcount}
                onChange={(e) => setFormData({...formData, headcount: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
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
                onChange={(e) => setFormData({...formData, issue_date: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">有效期限</label>
              <input
                type="date"
                value={formData.valid_until || ''}
                onChange={(e) => setFormData({...formData, valid_until: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
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
    </div>
  );
};

export default Approvals;
