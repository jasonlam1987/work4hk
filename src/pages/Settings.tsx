import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Search, Plus, Edit2, Loader2, RefreshCw, Key, Eye, EyeOff, Trash2, Users2, Handshake, ScrollText, HardDrive, Download } from 'lucide-react';
import clsx from 'clsx';
import apiClient from '../api/client';
import Modal from '../components/Modal';
import JSZip from 'jszip';
import { getEmployers } from '../api/employers';
import { getApprovals } from '../api/approvals';
import { getWorkers } from '../api/workers';
import { 
  Partner, PartnerCreate, getPartners, createPartner, updatePartner
} from '../api/settings';
import {
  AuthorizedParty,
  AuthorizedPartyInput,
  createAuthorizedParty,
  deleteAuthorizedParty,
  filterAuthorizedParties,
  readAuthorizedParties,
  updateAuthorizedParty,
} from '../utils/authorizedParties';
import {
  LabourCompany,
  createLabourCompany,
  deleteLabourCompany,
  filterLabourCompanies,
  readLabourCompanies,
  updateLabourCompany,
} from '../utils/labourCompanies';
import Users, { UsersHandle } from './Users';
import { getAuthIdentity } from '../utils/authRole';
import { GlobalAuditLog, readGlobalAuditLogs } from '../utils/auditLog';

type Tab = 'partners' | 'labour_companies' | 'authorized_parties' | 'users' | 'api_keys' | 'audit_logs';

type HttpErrorLike = {
  response?: {
    data?: {
      detail?: unknown;
    };
  };
};

type StorageStats = {
  backend: 'supabase' | 'local';
  file_count: number;
  by_module?: Record<string, number>;
  used_bytes: number;
  capacity_bytes: number | null;
  capacity_source?: string;
  remaining_bytes: number | null;
  usage_ratio: number | null;
  max_upload_size_bytes: number;
  note?: string;
};

type BulkManifestItem = {
  uid: string;
  module: 'employers' | 'approvals' | 'workers' | string;
  owner_id: number;
  folder: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
  download_url: string;
};

type LabourCompanyFormState = {
  company_name: string;
  company_code: string;
  contact_person: string;
  price_per_person_month: number | null;
};

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('partners');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [auditLogs, setAuditLogs] = useState<GlobalAuditLog[]>([]);
  const [auditDate, setAuditDate] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 25;

  const usersRef = useRef<UsersHandle>(null);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [labourCompanies, setLabourCompanies] = useState<LabourCompany[]>([]);
  const [authorizedParties, setAuthorizedParties] = useState<AuthorizedParty[]>([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedLabourCompanyId, setSelectedLabourCompanyId] = useState<string | null>(null);
  const [selectedAuthorizedPartyId, setSelectedAuthorizedPartyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [partnerForm, setPartnerForm] = useState<PartnerCreate>({ name: '' });
  const [labourCompanyForm, setLabourCompanyForm] = useState<LabourCompanyFormState>({
    company_name: '',
    company_code: '',
    contact_person: '',
    price_per_person_month: null,
  });
  const [authorizedPartyForm, setAuthorizedPartyForm] = useState<AuthorizedPartyInput>({
    company_name: '',
    business_registration_number: '',
    representative_name: '',
    gender: 'male',
    email: '',
    id_type: 'HKID',
    id_number: '',
  });

  const [apiKeys, setApiKeys] = useState({
    tencentSecretId: '',
    tencentSecretKey: '',
    authPrecheckToken: ''
  });

  const [showTencentSecretId, setShowTencentSecretId] = useState(false);
  const [showTencentSecretKey, setShowTencentSecretKey] = useState(false);
  const [showAuthPrecheckToken, setShowAuthPrecheckToken] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [storageStatsLoading, setStorageStatsLoading] = useState(false);
  const [storageStatsError, setStorageStatsError] = useState('');
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState({ done: 0, total: 0 });

  const authHeaders = () => {
    const identity = getAuthIdentity();
    return {
      'x-user-role': identity.roleKey || 'admin',
      'x-user-id': String(identity.userId || ''),
      'x-user-name': encodeURIComponent(String(identity.userName || '').trim()),
    };
  };

  const formatBytes = (n: number | null | undefined) => {
    const size = Number(n || 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    const value = size / Math.pow(1024, idx);
    return `${value.toFixed(value >= 100 || idx === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[idx]}`;
  };

  const normalizePriceInput = (raw: string) => {
    const cleaned = String(raw || '')
      .replace(/[^\d.]/g, '')
      .replace(/(\..*)\./g, '$1');
    if (!cleaned.trim()) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  };

  const formatPriceDisplay = (value: number | null | undefined) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    return `${n}元/人/月`;
  };

  const safePathSegment = (input: string) =>
    String(input || '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'unknown';

  const toBrowserDownloadUrl = (downloadUrl: string) => {
    const raw = String(downloadUrl || '').trim();
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/api/')) return raw;
    if (raw.startsWith('/ai/')) return `/api${raw}`;
    return raw.startsWith('/') ? raw : `/${raw}`;
  };

  const fetchStorageStats = useCallback(async () => {
    setStorageStatsLoading(true);
    setStorageStatsError('');
    try {
      const res = await apiClient.get<StorageStats>('/ai/storage-stats', { headers: authHeaders() });
      setStorageStats(res.data || null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setStorageStats(null);
      setStorageStatsError(typeof detail === 'string' ? detail : '讀取儲存容量失敗');
    } finally {
      setStorageStatsLoading(false);
    }
  }, []);

  const handleBulkDownloadAttachments = async () => {
    if (bulkDownloading) return;
    setBulkDownloading(true);
    setBulkDownloadProgress({ done: 0, total: 0 });
    try {
      const res = await apiClient.get<{ total: number; items: BulkManifestItem[] }>('/ai/files-bulk-manifest', {
        headers: authHeaders(),
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      if (items.length === 0) {
        alert('目前沒有可下載的附件');
        return;
      }
      const [employers, approvals, workers] = await Promise.all([
        getEmployers().catch(() => []),
        getApprovals().catch(() => []),
        getWorkers().catch(() => []),
      ]);
      const employerNameById = new Map<number, string>(
        (employers || []).map((it: any) => [Number(it?.id || 0), String(it?.name || it?.english_name || '').trim()])
      );
      const approvalLabelById = new Map<number, string>(
        (approvals || []).map((it: any) => [Number(it?.id || 0), String(it?.approval_number || '').trim()])
      );
      const workerNameById = new Map<number, string>(
        (workers || []).map((it: any) => [Number(it?.id || 0), String(it?.labour_name || it?.pinyin_name || '').trim()])
      );
      setBulkDownloadProgress({ done: 0, total: items.length });
      const zip = new JSZip();
      let done = 0;
      let successCount = 0;
      for (const item of items) {
        const url = toBrowserDownloadUrl(item.download_url);
        if (!url) continue;
        try {
          const resp = await fetch(url, { headers: authHeaders() as any });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const moduleName = safePathSegment(item.module || 'unknown_module');
          const ownerId = Number(item.owner_id || 0);
          const ownerLabel =
            moduleName === 'employers'
              ? employerNameById.get(ownerId) || `企業_${ownerId}`
              : moduleName === 'approvals'
                ? approvalLabelById.get(ownerId) || `批文_${ownerId}`
                : moduleName === 'workers'
                  ? workerNameById.get(ownerId) || `勞工_${ownerId}`
                  : `owner_${ownerId}`;
          const ownerSeg = safePathSegment(ownerLabel);
          const folderSeg = safePathSegment(item.folder || 'unknown_folder');
          const fileName = safePathSegment(item.original_name || `${item.uid}.bin`);
          zip.folder(moduleName)?.folder(ownerSeg)?.folder(folderSeg)?.file(fileName, blob);
          successCount += 1;
        } catch {
          // Skip failed files and continue generating zip for available attachments.
        } finally {
          done += 1;
          setBulkDownloadProgress({ done, total: items.length });
        }
      }

      if (successCount <= 0) {
        alert('批量下載失敗：未能取得任何附件，請稍後重試。');
        return;
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const fileName = `attachments-backup-${stamp}.zip`;
      const href = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      alert(`批量下載完成：成功 ${successCount}/${items.length} 項（已打包為 ZIP）`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      alert(typeof detail === 'string' ? detail : '批量下載附件失敗');
    } finally {
      setBulkDownloading(false);
      setBulkDownloadProgress({ done: 0, total: 0 });
    }
  };

  const fetchData = useCallback(async () => {
    if (activeTab === 'audit_logs') {
      setLoading(true);
      setError('');
      try {
        const logs = await readGlobalAuditLogs();
        setAuditLogs(logs);
      } catch {
        setAuditLogs([]);
        setError('讀取日誌失敗');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (activeTab === 'api_keys') {
      const storedKeys = localStorage.getItem('system_api_keys');
      if (storedKeys) {
        setApiKeys(prev => {
          try {
            const parsed = JSON.parse(storedKeys);
            return { ...prev, ...parsed };
          } catch {
            return prev;
          }
        });
      }
      fetchStorageStats();
      return;
    }

    if (activeTab === 'authorized_parties') {
      setLoading(true);
      setError('');
      try {
        const list = readAuthorizedParties();
        setAuthorizedParties(filterAuthorizedParties(list, search));
      } catch {
        setAuthorizedParties([]);
        setError('讀取授權方資料失敗');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (activeTab === 'labour_companies') {
      setLoading(true);
      setError('');
      try {
        const list = readLabourCompanies();
        setLabourCompanies(filterLabourCompanies(list, search));
      } catch {
        setLabourCompanies([]);
        setError('讀取勞務公司資料失敗');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (activeTab === 'users') return;

    try {
      setLoading(true);
      setError('');
      const data = await getPartners({ q: search });
      setPartners(data);
    } catch (err: unknown) {
      const e = err as HttpErrorLike;
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : '獲取資料失敗');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, fetchStorageStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, search, fetchData]);

  useEffect(() => {
    if (activeTab === 'audit_logs') setAuditPage(1);
  }, [activeTab, search, auditDate]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedId(null);
    setSelectedLabourCompanyId(null);
    setSelectedAuthorizedPartyId(null);
    if (activeTab === 'partners') setPartnerForm({ name: '' });
    if (activeTab === 'labour_companies') {
      setLabourCompanyForm({
        company_name: '',
        company_code: '',
        contact_person: '',
        price_per_person_month: null,
      });
    }
    if (activeTab === 'authorized_parties') {
      setAuthorizedPartyForm({
        company_name: '',
        business_registration_number: '',
        representative_name: '',
        gender: 'male',
        email: '',
        id_type: 'HKID',
        id_number: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Partner) => {
    setIsEditing(true);
    setSelectedId(item.id);
    setSelectedLabourCompanyId(null);
    setSelectedAuthorizedPartyId(null);
    setPartnerForm({
      name: item.name,
      phone: item.phone || '',
      email: item.email || '',
      remarks: item.remarks || '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditLabourCompany = (item: LabourCompany) => {
    setIsEditing(true);
    setSelectedId(null);
    setSelectedLabourCompanyId(item.id);
    setSelectedAuthorizedPartyId(null);
    setLabourCompanyForm({
      company_name: item.company_name || '',
      company_code: item.company_code || '',
      contact_person: item.contact_person || '',
      price_per_person_month: item.price_per_person_month ?? null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditAuthorizedParty = (item: AuthorizedParty) => {
    setIsEditing(true);
    setSelectedId(null);
    setSelectedLabourCompanyId(null);
    setSelectedAuthorizedPartyId(item.id);
    setAuthorizedPartyForm({
      company_name: item.company_name || '',
      business_registration_number: item.business_registration_number || '',
      representative_name: item.representative_name || '',
      gender: item.gender || 'male',
      email: item.email || '',
      id_type: item.id_type || 'HKID',
      id_number: item.id_number || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (activeTab === 'authorized_parties') {
        if (isEditing && selectedAuthorizedPartyId) updateAuthorizedParty(selectedAuthorizedPartyId, authorizedPartyForm);
        else createAuthorizedParty(authorizedPartyForm);
        setIsModalOpen(false);
        fetchData();
        return;
      }
      if (activeTab === 'labour_companies') {
        const price = Number(labourCompanyForm.price_per_person_month);
        if (!Number.isFinite(price) || price < 0) {
          alert('合作價格格式不正確，請輸入有效數字');
          return;
        }
        const payload = {
          company_name: String(labourCompanyForm.company_name || '').trim(),
          company_code: String(labourCompanyForm.company_code || '').trim(),
          contact_person: String(labourCompanyForm.contact_person || '').trim(),
          price_per_person_month: price,
        };
        if (!payload.company_name || !payload.company_code || !payload.contact_person) {
          alert('請完整填寫勞務公司資料');
          return;
        }
        if (isEditing && selectedLabourCompanyId) updateLabourCompany(selectedLabourCompanyId, payload);
        else createLabourCompany(payload);
        setIsModalOpen(false);
        fetchData();
        return;
      }
      if (isEditing && selectedId) await updatePartner(selectedId, partnerForm);
      else await createPartner(partnerForm);
      setIsModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const e = err as HttpErrorLike;
      const detail = e?.response?.data?.detail;
      alert(typeof detail === 'string' ? detail : '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAuthorizedParty = (id: string) => {
    const ok = window.confirm('確定要刪除此授權方資料嗎？');
    if (!ok) return;
    deleteAuthorizedParty(id);
    fetchData();
  };

  const handleDeleteLabourCompany = (id: string) => {
    const ok = window.confirm('確定要刪除此勞務公司資料嗎？');
    if (!ok) return;
    deleteLabourCompany(id);
    fetchData();
  };

  const handleSaveApiKeys = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem('system_api_keys', JSON.stringify(apiKeys));
      setSaving(false);
      alert('API 金鑰已成功儲存！');
    }, 500);
  };

  const clearLocalMockData = async () => {
    const ok = window.confirm('確定要清除所有管理板塊的本機資料嗎（含審批/僱主/勞工/職位/附件與通知暫存）？此操作只會影響目前瀏覽器，且無法回復。');
    if (!ok) return;
    try {
      const identity = getAuthIdentity();
      const csrfToken =
        document.cookie
          .split('; ')
          .find((x) => x.startsWith('csrf_token='))
          ?.split('=')
          .slice(1)
          .join('=') || '';
      await apiClient.post(
        '/ai/files-delete-requests-reset',
        {},
        {
          headers: {
            'x-user-role': identity.roleKey || 'admin',
            'x-user-id': identity.userId || '',
            'x-user-name': encodeURIComponent(String(identity.userName || '').trim()),
            'x-csrf-token': decodeURIComponent(csrfToken || ''),
          },
        }
      );
    } catch {
      // If backend cleanup fails, still clear local browser data below.
    }
    const exactKeys = new Set([
      'mock_approvals',
      'mock_approval_files',
      'mock_employer_files',
      'mock_worker_files',
      'mock_deleted_user_ids',
      'approval_quota_details_v1',
      'approval_versions_v1',
      'approval_reminders_v1',
      'worker_profiles_v1',
      'delete_request_notify',
      'work4hk_in_app_messages_v1',
      'work4hk_delete_pending_state_v1',
    ]);
    const prefixKeys = ['cache_'];
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (exactKeys.has(key) || prefixKeys.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.removeItem('dashboardStats');
    window.location.reload();
  };

  const renderTable = () => {
    if (activeTab === 'audit_logs') {
      const toDateKey = (value: string) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const filtered = auditLogs.filter((x) => {
        const q = search.trim().toLowerCase();
        const dateOk = !auditDate || toDateKey(x.at) === auditDate;
        if (!q) return dateOk;
        const hay = `${x.module} ${x.action} ${x.actor_name} ${x.record_no || ''} ${x.details || ''}`.toLowerCase();
        return dateOk && hay.includes(q);
      });
      const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
      const currentPage = Math.min(auditPage, totalPages);
      const start = (currentPage - 1) * AUDIT_PAGE_SIZE;
      const visible = filtered.slice(start, start + AUDIT_PAGE_SIZE);
      return (
        <div className="p-4">
          <div className="rounded-apple-sm border border-gray-200 bg-white/60 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50/70 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">時間</th>
                  <th className="px-4 py-3 text-left">操作者</th>
                  <th className="px-4 py-3 text-left">模塊</th>
                  <th className="px-4 py-3 text-left">動作</th>
                  <th className="px-4 py-3 text-left">內容</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">暫無日誌記錄</td>
                  </tr>
                ) : (
                  visible.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{new Date(log.at).toLocaleString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{log.actor_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{log.module}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{log.action}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.record_no ? `#${log.record_no} ` : ''}
                        {log.section ? `[${log.section}] ` : ''}
                        {log.details || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span>共 {filtered.length} 條，當前第 {currentPage} / {totalPages} 頁（每頁 25 條）</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一頁
              </button>
              <button
                type="button"
                onClick={() => setAuditPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一頁
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'api_keys') {
      return (
        <div className="p-6 max-w-3xl">
          <form onSubmit={handleSaveApiKeys} className="space-y-5">
            <div className="rounded-apple-sm border border-gray-200/60 bg-white/60 backdrop-blur-xl p-6 shadow-apple-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Key className="w-5 h-5 mr-2 text-apple-blue" />
                    OCR 圖像辨識
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">用於「僱主管理」中的商業登記證 (BR) 自動辨識功能。</p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-70"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{saving ? '儲存中...' : '儲存金鑰'}</span>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SecretId（騰訊雲 OCR / COS）</label>
                  <div className="relative">
                    <input
                      type={showTencentSecretId ? 'text' : 'password'}
                      value={apiKeys.tencentSecretId}
                      onChange={(e) => setApiKeys({ ...apiKeys, tencentSecretId: e.target.value })}
                      placeholder="例如：AKID..."
                      className="w-full h-11 px-4 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      aria-label={showTencentSecretId ? '隱藏 SecretId' : '顯示 SecretId'}
                      aria-pressed={showTencentSecretId}
                      onClick={() => setShowTencentSecretId(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showTencentSecretId ? '隱藏' : '顯示'}
                    >
                      {showTencentSecretId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SecretKey（騰訊雲 OCR / COS）</label>
                  <div className="relative">
                    <input
                      type={showTencentSecretKey ? 'text' : 'password'}
                      value={apiKeys.tencentSecretKey}
                      onChange={(e) => setApiKeys({ ...apiKeys, tencentSecretKey: e.target.value })}
                      placeholder="請輸入 SecretKey..."
                      className="w-full h-11 px-4 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      aria-label={showTencentSecretKey ? '隱藏 SecretKey' : '顯示 SecretKey'}
                      aria-pressed={showTencentSecretKey}
                      onClick={() => setShowTencentSecretKey(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showTencentSecretKey ? '隱藏' : '顯示'}
                    >
                      {showTencentSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-apple-sm border border-gray-200/60 bg-white/60 backdrop-blur-xl p-6 shadow-apple-sm">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Key className="w-5 h-5 mr-2 text-apple-blue" />
                登入預檢
              </h3>
              <p className="text-sm text-gray-500 mt-1">僅保留登入前檢測賬戶用途；微信登入金鑰配置已移除。</p>
              <div className="mt-5 grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auth Precheck Token</label>
                  <div className="relative">
                    <input
                      type={showAuthPrecheckToken ? 'text' : 'password'}
                      value={apiKeys.authPrecheckToken}
                      onChange={(e) => setApiKeys({ ...apiKeys, authPrecheckToken: e.target.value })}
                      placeholder="用於登入前檢測賬戶是否存在"
                      className="w-full h-11 px-4 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      aria-label={showAuthPrecheckToken ? '隱藏 Auth Precheck Token' : '顯示 Auth Precheck Token'}
                      aria-pressed={showAuthPrecheckToken}
                      onClick={() => setShowAuthPrecheckToken(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showAuthPrecheckToken ? '隱藏' : '顯示'}
                    >
                      {showAuthPrecheckToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-apple-sm border border-gray-200/60 bg-white/60 backdrop-blur-xl p-6 shadow-apple-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <HardDrive className="w-5 h-5 mr-2 text-apple-blue" />
                    線上附件儲存容量
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">顯示目前附件已使用容量，並提供一鍵批量下載全部附件（ZIP）。</p>
                </div>
                <button
                  type="button"
                  onClick={fetchStorageStats}
                  className="h-10 px-3 border border-gray-200 rounded-apple-sm text-sm hover:bg-gray-50 inline-flex items-center gap-2"
                  disabled={storageStatsLoading}
                >
                  <RefreshCw className={clsx('w-4 h-4', storageStatsLoading && 'animate-spin')} />
                  <span>刷新容量</span>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">已使用</div>
                  <div className="text-base font-semibold text-gray-900">{formatBytes(storageStats?.used_bytes)}</div>
                </div>
                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">總容量</div>
                  <div className="text-base font-semibold text-gray-900">
                    {storageStats?.capacity_bytes ? formatBytes(storageStats.capacity_bytes) : '未設定'}
                  </div>
                  {storageStats?.capacity_source && (
                    <div className="text-[11px] text-gray-500 mt-1">來源：{storageStats.capacity_source}</div>
                  )}
                </div>
                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">附件數量（全站）</div>
                  <div className="text-base font-semibold text-gray-900">{Number(storageStats?.file_count || 0)}</div>
                  {!!storageStats?.by_module && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      企業 {Number(storageStats.by_module.employers || 0)} / 批文 {Number(storageStats.by_module.approvals || 0)} / 勞工 {Number(storageStats.by_module.workers || 0)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">
                  使用率：{storageStats?.usage_ratio != null ? `${(storageStats.usage_ratio * 100).toFixed(1)}%` : '未計算'}
                  {' '}| 單檔上限：{formatBytes(storageStats?.max_upload_size_bytes)}
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-apple-blue transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, Number((storageStats?.usage_ratio || 0) * 100)))}%` }}
                  />
                </div>
                {storageStatsError && <div className="mt-2 text-xs text-red-600">{storageStatsError}</div>}
                {!storageStatsError && storageStats?.note && <div className="mt-2 text-xs text-gray-500">{storageStats.note}</div>}
                {!storageStatsError && !storageStats?.capacity_bytes && (
                  <div className="mt-1 text-xs text-amber-700">
                    提示：請在線上伺服器設定 `FILE_STORAGE_CAPACITY_BYTES`（或 `SUPABASE_STORAGE_CAPACITY_BYTES`）以顯示總容量與剩餘容量。
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBulkDownloadAttachments}
                  disabled={bulkDownloading}
                  className="h-10 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-70"
                >
                  {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{bulkDownloading ? '打包中...' : '一鍵批量下載附件'}</span>
                </button>
                {bulkDownloading && (
                  <span className="text-xs text-gray-500">
                    進度：{bulkDownloadProgress.done}/{bulkDownloadProgress.total}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-apple-sm border border-red-200/70 bg-red-50/60 backdrop-blur-xl p-6 shadow-apple-sm">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Trash2 className="w-5 h-5 mr-2 text-red-600" />
                本機管理資料
              </h3>
              <p className="text-sm text-gray-600 mt-1">清除瀏覽器內所有管理板塊的本機快取/暫存資料（含審批模塊；只影響目前瀏覽器，且無法回復）。</p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearLocalMockData}
                  className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white rounded-apple-sm font-medium transition-colors"
                >
                  清除本機資料
                </button>
              </div>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'users') {
      return (
        <Users embedded showCreateButton={false} ref={usersRef} />
      );
    }

    if (activeTab === 'authorized_parties') {
      return (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">第三方公司名稱</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商業登記號碼</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名/性別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">電郵</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">身份證明文件</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white/30 divide-y divide-gray-200">
            {authorizedParties.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">找不到資料</td></tr>
            ) : (
              authorizedParties.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.company_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.business_registration_number || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.representative_name || '-'} / {item.gender === 'female' ? '女' : '男'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.id_type === 'HKID' ? '香港身份證' : '其他證據'}：{item.id_number || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleOpenEditAuthorizedParty(item)} className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAuthorizedParty(item.id)}
                      className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    }

    if (activeTab === 'labour_companies') {
      return (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">勞務公司名字</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">勞務公司編號</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">聯繫人</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合作價格</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white/30 divide-y divide-gray-200">
            {labourCompanies.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">找不到資料</td></tr>
            ) : (
              labourCompanies.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.company_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.company_code || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.contact_person || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatPriceDisplay(item.price_per_person_month)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleOpenEditLabourCompany(item)} className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLabourCompany(item.id)}
                      className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    }

    if (loading && activeTab === 'partners' && !partners.length) {
      return (
        <div className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      );
    }
    return (
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名稱</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">聯絡電話</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">備註</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white/30 divide-y divide-gray-200">
          {partners.length === 0 ? (
            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">找不到資料</td></tr>
          ) : (
            partners.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.phone || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{item.remarks || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleOpenEdit(item)} className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  };

  const getTabLabel = (tab: Tab) => {
    switch(tab) {
      case 'partners': return '合作方';
      case 'labour_companies': return '勞務公司管理';
      case 'authorized_parties': return '授權方管理';
      case 'users': return '用戶管理';
      case 'api_keys': return 'API 金鑰管理';
      case 'audit_logs': return '查看日誌';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">系統設定</h1>
          <p className="text-gray-500 mt-1">管理合作方、勞務公司、授權方、用戶與系統 API</p>
        </div>
        {(activeTab === 'partners' || activeTab === 'labour_companies' || activeTab === 'authorized_parties' || activeTab === 'users') && (
          <button 
            onClick={() => {
              if (activeTab === 'users') {
                usersRef.current?.openCreate();
              } else {
                handleOpenCreate();
              }
            }}
            className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>{activeTab === 'users' ? '新增用戶' : `新增${getTabLabel(activeTab)}`}</span>
          </button>
        )}
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="border-b border-gray-200/50 bg-white/60 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {((getAuthIdentity().roleKey === 'super_admin'
              ? ['partners', 'labour_companies', 'authorized_parties', 'users', 'api_keys', 'audit_logs']
              : ['partners', 'labour_companies', 'authorized_parties', 'users', 'api_keys']) as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(''); }}
                className={clsx(
                  'h-10 px-3 rounded-apple-sm text-sm font-medium transition-colors inline-flex items-center gap-2 border',
                  activeTab === tab
                    ? 'bg-apple-blue/10 text-apple-blue border-apple-blue/20'
                    : 'bg-white/60 text-gray-600 border-gray-200/60 hover:bg-white hover:text-gray-900'
                )}
              >
                {tab === 'partners' && <Handshake className="w-4 h-4" />}
                {tab === 'labour_companies' && <Handshake className="w-4 h-4" />}
                {tab === 'authorized_parties' && <Handshake className="w-4 h-4" />}
                {tab === 'users' && <Users2 className="w-4 h-4" />}
                {tab === 'api_keys' && <Key className="w-4 h-4" />}
                {tab === 'audit_logs' && <ScrollText className="w-4 h-4" />}
                <span>{getTabLabel(tab)}</span>
              </button>
            ))}
          </div>
        </div>

        {(activeTab === 'partners' || activeTab === 'labour_companies' || activeTab === 'authorized_parties' || activeTab === 'audit_logs') && (
          <div className="p-4 border-b border-gray-200/50 bg-white/30 flex items-center justify-between">
            <div className="flex items-center gap-2 w-full">
              <div className="relative w-full max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder={activeTab === 'audit_logs' ? '搜尋日誌（模塊/動作/操作者/內容）...' : `搜尋${getTabLabel(activeTab)}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
                />
              </div>
              {activeTab === 'audit_logs' && (
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-apple-sm bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                  title="選擇日誌日期"
                />
              )}
              {activeTab === 'audit_logs' && auditDate && (
                <button
                  type="button"
                  onClick={() => setAuditDate('')}
                  className="h-10 px-3 text-xs border border-gray-200 rounded-apple-sm hover:bg-gray-50"
                >
                  清除日期
                </button>
              )}
            </div>
            <button onClick={fetchData} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
              <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
            </button>
          </div>
        )}

        {error && (
          <div role="alert" aria-live="polite" className="p-4 bg-red-50 text-red-700 text-sm border-b border-red-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          {renderTable()}
        </div>
      </div>

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? `編輯${getTabLabel(activeTab)}` : `新增${getTabLabel(activeTab)}`}
        className={activeTab === 'authorized_parties' ? 'max-w-2xl' : 'max-w-md'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'authorized_parties' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">第三方公司名稱 *</label>
                <input
                  type="text"
                  value={authorizedPartyForm.company_name}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, company_name: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">第三方公司商業登記號碼（8位）*</label>
                <input
                  type="text"
                  value={authorizedPartyForm.business_registration_number}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, business_registration_number: e.target.value.replace(/[^\d]/g, '').slice(0, 8) }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">姓名 *</label>
                <input
                  type="text"
                  value={authorizedPartyForm.representative_name}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, representative_name: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">性別 *</label>
                <select
                  value={authorizedPartyForm.gender}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, gender: e.target.value as 'male' | 'female' }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                >
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">電郵 *</label>
                <input
                  type="email"
                  value={authorizedPartyForm.email}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">身份證明文件類別 *</label>
                <select
                  value={authorizedPartyForm.id_type}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, id_type: e.target.value as 'HKID' | 'OTHER' }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                >
                  <option value="HKID">香港身份證</option>
                  <option value="OTHER">其他證據</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">證件號 *</label>
                <input
                  type="text"
                  value={authorizedPartyForm.id_number}
                  onChange={(e) => setAuthorizedPartyForm((prev) => ({ ...prev, id_number: e.target.value }))}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
            </div>
          ) : activeTab === 'labour_companies' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">勞務公司名字 *</label>
                <input
                  type="text"
                  value={labourCompanyForm.company_name}
                  onChange={(e) => setLabourCompanyForm({ ...labourCompanyForm, company_name: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">勞務公司編號 *</label>
                <input
                  type="text"
                  value={labourCompanyForm.company_code}
                  onChange={(e) => setLabourCompanyForm({ ...labourCompanyForm, company_code: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">聯繫人 *</label>
                <input
                  type="text"
                  value={labourCompanyForm.contact_person}
                  onChange={(e) => setLabourCompanyForm({ ...labourCompanyForm, contact_person: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合作價格（元/人/月）*</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={
                    labourCompanyForm.price_per_person_month == null
                      ? ''
                      : String(labourCompanyForm.price_per_person_month)
                  }
                  onChange={(e) =>
                    setLabourCompanyForm({
                      ...labourCompanyForm,
                      price_per_person_month: normalizePriceInput(e.target.value),
                    })
                  }
                  placeholder="輸入 X"
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  顯示：{formatPriceDisplay(labourCompanyForm.price_per_person_month)}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">名稱 *</label>
                <input
                  type="text"
                  value={partnerForm.name}
                  onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">聯絡電話</label>
                <input
                  type="text"
                  value={partnerForm.phone || ''}
                  onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Email</label>
                <input
                  type="email"
                  value={partnerForm.email || ''}
                  onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">備註</label>
                <textarea
                  value={partnerForm.remarks || ''}
                  onChange={(e) => setPartnerForm({ ...partnerForm, remarks: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  rows={3}
                />
              </div>
            </div>
          )}

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

export default Settings;
