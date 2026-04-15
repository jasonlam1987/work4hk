import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw, Briefcase, GraduationCap, Link2, Phone, Home, Mail } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { Worker, WorkerCreate, createWorker, getWorkers, updateWorker } from '../api/workers';
import { Employer, getEmployers } from '../api/employers';
import { Approval, getApprovals } from '../api/approvals';
import { WorkerEducation, WorkerProfile, WorkerWorkExperience, getWorkerProfile, setWorkerProfile } from '../utils/workerProfile';

const WORKERS_CACHE_KEY = 'cache_workers_list_v1';
const EMPLOYERS_CACHE_KEY = 'cache_employers_list_v1';
const APPROVALS_CACHE_KEY = 'cache_approvals_list_v1';

const normalizeDate = (v: string) => {
  const s = String(v || '').trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');
  return s;
};

const isMainlandId = (v: string) => /^\d{17}[\dXx]$/.test(v.trim());

const emptyExperience = (): WorkerWorkExperience => ({ company_name: '', start_date: '', end_date: '' });
const emptyEducation = (): WorkerEducation => ({ school_name: '', start_date: '', graduation_date: '' });

const initialForm: WorkerCreate = {
  labour_name: '',
  id_card_number: '',
  labour_status: 'Active',
  application_status: 'Pending',
  contract_salary: 0,
  employment_term: '',
  employer_id: undefined,
  approval_id: undefined,
};

const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const [employers, setEmployers] = useState<Employer[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<WorkerCreate>(initialForm);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<WorkerProfile>({
    work_experiences: [emptyExperience()],
    educations: [emptyEducation()],
    entry_refused: false,
    marital_status: 'single',
  });

  const [employerQuery, setEmployerQuery] = useState('');
  const [approvalQuery, setApprovalQuery] = useState('');
  const [employerDropdownOpen, setEmployerDropdownOpen] = useState(false);
  const [approvalDropdownOpen, setApprovalDropdownOpen] = useState(false);
  const employerBlurTimer = useRef<number | null>(null);
  const approvalBlurTimer = useRef<number | null>(null);

  const employerId = Number((formData as any).employer_id || 0) || undefined;
  const approvalId = Number((formData as any).approval_id || profile.approval_id || 0) || undefined;

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const data = await getWorkers({ q: search });
      setWorkers(data);
      setError('');
      setHasLoaded(true);
      try {
        localStorage.setItem(WORKERS_CACHE_KEY, JSON.stringify({ items: data, savedAt: Date.now() }));
      } catch {
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || '獲取勞工列表失敗';
      setError(msg);
      if (!hasLoaded) {
        try {
          const raw = localStorage.getItem(WORKERS_CACHE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          const items = Array.isArray(parsed?.items) ? (parsed.items as Worker[]) : [];
          if (items.length > 0) {
            setWorkers(items);
            setHasLoaded(true);
          }
        } catch {
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployers = async () => {
    try {
      const list = await getEmployers({ limit: 1000 });
      setEmployers(list);
      return list;
    } catch {
      try {
        const raw = localStorage.getItem(EMPLOYERS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const items = Array.isArray(parsed?.items) ? (parsed.items as Employer[]) : [];
        if (items.length > 0) {
          setEmployers(items);
          return items;
        }
      } catch {
      }
      setEmployers([]);
      return [] as Employer[];
    }
  };

  const fetchApprovals = async () => {
    try {
      const list = await getApprovals({ limit: 1000 });
      setApprovals(list);
      return list;
    } catch {
      try {
        const raw = localStorage.getItem(APPROVALS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const items = Array.isArray(parsed?.items) ? (parsed.items as Approval[]) : [];
        if (items.length > 0) {
          setApprovals(items);
          return items;
        }
      } catch {
      }
      setApprovals([]);
      return [] as Approval[];
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKERS_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const items = Array.isArray(parsed?.items) ? (parsed.items as Worker[]) : [];
      if (items.length > 0) {
        setWorkers(items);
        setHasLoaded(true);
      }
    } catch {
    }

    fetchWorkers();
    fetchEmployers();
    fetchApprovals();
  }, []);

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
      ? approvals.filter(a => Number((a as any).employer_id ?? (a as any).employerId) === employerId)
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

  const handleOpenCreate = () => {
    setFormData(initialForm);
    setEmployerQuery('');
    setApprovalQuery('');
    setEmployerDropdownOpen(false);
    setApprovalDropdownOpen(false);
    setProfile({
      work_experiences: [emptyExperience()],
      educations: [emptyEducation()],
      entry_refused: false,
      marital_status: 'single',
    });
    setIsEditing(false);
    setSelectedId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (worker: Worker) => {
    setFormData({
      labour_name: worker.labour_name || '',
      id_card_number: worker.id_card_number || '',
      labour_status: worker.labour_status || 'Active',
      application_status: worker.application_status || 'Pending',
      contract_salary: worker.contract_salary || 0,
      employment_term: worker.employment_term || '',
      employer_id: worker.employer_id,
      approval_id: (worker as any).approval_id,
    });

    const p = getWorkerProfile(worker.id);
    const merged: WorkerProfile = {
      approval_id: (worker as any).approval_id ?? p.approval_id,
      approval_number: (worker as any).approval_number ?? p.approval_number,
      pinyin_name: (worker as any).pinyin_name ?? p.pinyin_name,
      contact_phone: (worker as any).contact_phone ?? p.contact_phone,
      residential_address: (worker as any).residential_address ?? p.residential_address,
      mailing_address: (worker as any).mailing_address ?? p.mailing_address,
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
    };
    setProfile(merged);

    const employer = employers.find(e => e.id === Number(worker.employer_id));
    setEmployerQuery(employer ? employer.name : worker.employer_name || '');
    const approvalNumber = (worker as any).approval_number || merged.approval_number;
    setApprovalQuery(approvalNumber ? String(approvalNumber) : '');

    setIsEditing(true);
    setSelectedId(worker.id);
    setIsModalOpen(true);
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
      labour_status: formData.labour_status,
      application_status: formData.application_status,
      contract_salary: formData.contract_salary,
      employment_term: formData.employment_term,
      employer_id: employerId,
    };
    if (id) return updateWorker(id, minimal);
    return createWorker(minimal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const labourName = String(formData.labour_name || '').trim();
    const idCard = String(formData.id_card_number || '').trim();
    if (!labourName) {
      alert('請輸入中文名字');
      return;
    }
    if (!idCard) {
      alert('請輸入內地身份證號碼');
      return;
    }
    if (!isMainlandId(idCard)) {
      alert('內地身份證號碼格式不正確（需 18 位，最後一位可為 X）');
      return;
    }
    if (!employerId) {
      alert('請選擇僱主');
      return;
    }
    if (!approvalId && !String(profile.approval_number || '').trim()) {
      alert('請選擇批文');
      return;
    }
    if (profile.entry_refused) {
      const d = String(profile.entry_refused_date || '').trim();
      const r = String(profile.entry_refused_reason || '').trim();
      if (!d || !r) {
        alert('請補充入境被拒的日期及原因');
        return;
      }
    }

    setSaving(true);
    try {
      const fullPayload: WorkerCreate = {
        ...formData,
        labour_name: labourName,
        id_card_number: idCard,
        employer_id: employerId,
        approval_id: approvalId,
        approval_number: String(profile.approval_number || '').trim() || undefined,
        pinyin_name: String(profile.pinyin_name || '').trim() || undefined,
        contact_phone: String(profile.contact_phone || '').trim() || undefined,
        residential_address: String(profile.residential_address || '').trim() || undefined,
        mailing_address: String(profile.mailing_address || '').trim() || undefined,
        marital_status: profile.marital_status,
        entry_refused: Boolean(profile.entry_refused),
        entry_refused_date: profile.entry_refused_date ? normalizeDate(profile.entry_refused_date) : undefined,
        entry_refused_reason: String(profile.entry_refused_reason || '').trim() || undefined,
        work_experiences: Array.isArray(profile.work_experiences)
          ? profile.work_experiences
              .map(x => ({
                company_name: String(x.company_name || '').trim(),
                start_date: normalizeDate(String(x.start_date || '').trim()),
                end_date: normalizeDate(String(x.end_date || '').trim()),
              }))
              .filter(x => x.company_name || x.start_date || x.end_date)
          : undefined,
        educations: Array.isArray(profile.educations)
          ? profile.educations
              .map(x => ({
                school_name: String(x.school_name || '').trim(),
                start_date: normalizeDate(String(x.start_date || '').trim()),
                graduation_date: normalizeDate(String(x.graduation_date || '').trim()),
              }))
              .filter(x => x.school_name || x.start_date || x.graduation_date)
          : undefined,
      };

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
        setWorkerProfile(selectedId, profile);
      } else {
        try {
          const created = await createWorker(fullPayload);
          if (created?.id) setWorkerProfile(Number(created.id), profile);
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;
          const text = JSON.stringify(err?.response?.data || {}).toLowerCase();
          if (status === 422 && (text.includes('extra') || text.includes('not permitted') || text.includes('unexpected'))) {
            const created = await retryWithoutExtras(null, labourName, idCard);
            if ((created as any)?.id) setWorkerProfile(Number((created as any).id), profile);
            alert('後端暫未支援部分擴展欄位；已改為只保存核心資料，其他欄位將保存在本機。');
          } else {
            throw err;
          }
        }
      }

      setIsModalOpen(false);
      fetchWorkers();
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
          <button onClick={fetchWorkers} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
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
                workers.map((worker) => {
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
                            worker.labour_status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {worker.labour_status || '未知'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleOpenEdit(worker)}
                          className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                onChange={(e) => setFormData({ ...formData, labour_name: e.target.value })}
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
                onChange={(e) => setProfile(prev => ({ ...prev, pinyin_name: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：ZHANG SAN"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">聯繫電話</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={profile.contact_phone || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, contact_phone: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  placeholder="例如：+86 13xxxxxxxxx"
                />
              </div>
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
              >
                <option value="Active">Active (在職)</option>
                <option value="Inactive">Inactive (離職)</option>
                <option value="Pending">Pending (待處理)</option>
              </select>
            </div>

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
                        setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: undefined }));
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
                                setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: undefined }));
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
                        setProfile(prev => ({ ...prev, approval_id: undefined, approval_number: v }));
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
                                setProfile(prev => ({ ...prev, approval_id: (a as any).id, approval_number: a.approval_number }));
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
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請狀態</label>
              <input
                type="text"
                value={formData.application_status}
                onChange={(e) => setFormData({ ...formData, application_status: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合約薪資</label>
              <input
                type="number"
                value={formData.contract_salary}
                onChange={(e) => setFormData({ ...formData, contract_salary: Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱傭期限</label>
              <input
                type="text"
                value={formData.employment_term}
                onChange={(e) => setFormData({ ...formData, employment_term: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：2年"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div className="space-y-3">
                {(profile.work_experiences || []).map((x, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
              <div className="space-y-3">
                {(profile.educations || []).map((x, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
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

export default Workers;
